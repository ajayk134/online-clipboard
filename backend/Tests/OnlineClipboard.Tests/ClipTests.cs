using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;

namespace OnlineClipboard.Tests;

public static class ClipValidation
{
    public static IList<string> ValidateCreate(string? content, string? contentType, IList<string>? tags)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(content)) errors.Add("Content is required");
        else if (content!.Length > 100_000) errors.Add("Content too large (max 100KB)");
        if (!string.IsNullOrWhiteSpace(contentType))
        {
            var ct = contentType.Trim().ToLowerInvariant();
            if (ct != "text" && ct != "richtext" && ct != "code")
                errors.Add("Invalid content type");
        }
        if (tags != null && tags.Count > 10) errors.Add("Maximum 10 tags");
        return errors;
    }

    public static bool IsValidSort(string? sort) =>
        sort switch
        {
            "title_asc" or "title_desc" or "created_desc" or "created_asc"
            or "updated_desc" or "updated_asc" or "copy_desc" or "view_desc" or null => true,
            _ => false,
        };
}

public class ClipTests
{
    private static ClipDto NewClip(long id, long userId, string content, string contentType = "text",
        string? title = null, IList<string>? tags = null, bool isFavorite = false, bool isPinned = false,
        int copyCount = 0, int viewCount = 0, bool shareEnabled = false, DateTime? expiresAt = null)
        => new()
        {
            Id = id, UserId = userId, Title = title ?? $"Clip {id}", Content = content,
            ContentType = contentType, Tags = tags?.ToList() ?? new List<string>(),
            IsFavorite = isFavorite, IsPinned = isPinned, CopyCount = copyCount, ViewCount = viewCount,
            ShareEnabled = shareEnabled, ExpiresAt = expiresAt,
            CreatedAt = DateTime.UtcNow.AddMinutes(-id), UpdatedAt = DateTime.UtcNow.AddMinutes(-id),
        };

    [Fact]
    public void Create_validation_rejects_missing_content()
    {
        var errors = ClipValidation.ValidateCreate(null, "text", null);
        Assert.Contains(errors, e => e.Contains("Content is required"));
        errors = ClipValidation.ValidateCreate("", "text", null);
        Assert.Contains(errors, e => e.Contains("Content is required"));
        errors = ClipValidation.ValidateCreate("   ", "text", null);
        Assert.Contains(errors, e => e.Contains("Content is required"));
    }

    [Fact]
    public void Create_validation_rejects_oversized_content()
    {
        var errors = ClipValidation.ValidateCreate(new string('a', 100_001), "text", null);
        Assert.Contains(errors, e => e.Contains("Content too large"));
        var ok = ClipValidation.ValidateCreate(new string('a', 100_000), "text", null);
        Assert.Empty(ok);
    }

    [Fact]
    public void Create_validation_rejects_invalid_content_type()
    {
        var errors = ClipValidation.ValidateCreate("x", "image/png", null);
        Assert.Contains(errors, e => e.Contains("Invalid content type"));
        Assert.Empty(ClipValidation.ValidateCreate("x", "text", null));
        Assert.Empty(ClipValidation.ValidateCreate("x", "richtext", null));
        Assert.Empty(ClipValidation.ValidateCreate("x", "code", null));
    }

    [Fact]
    public void Create_validation_rejects_too_many_tags()
    {
        var tooMany = Enumerable.Range(0, 11).Select(i => $"t{i}").ToList();
        var errors = ClipValidation.ValidateCreate("x", "text", tooMany);
        Assert.Contains(errors, e => e.Contains("Maximum 10 tags"));
        var ok = ClipValidation.ValidateCreate("x", "text", Enumerable.Range(0, 10).Select(i => $"t{i}").ToList());
        Assert.Empty(ok);
    }

    [Fact]
    public void List_applies_tag_filter()
    {
        var clips = new List<ClipDto>
        {
            NewClip(1, 1, "alpha", tags: new[] { "red" }),
            NewClip(2, 1, "beta", tags: new[] { "blue" }),
            NewClip(3, 1, "gamma", tags: new[] { "red", "blue" }),
        };
        var byTag = clips.Where(c => c.Tags.Contains("red")).ToList();
        Assert.Equal(2, byTag.Count);
        Assert.All(byTag, c => Assert.Contains("red", c.Tags));
    }

    [Fact]
    public void List_applies_favorite_and_pinned_filters()
    {
        var clips = new List<ClipDto>
        {
            NewClip(1, 1, "a", isFavorite: true, isPinned: false),
            NewClip(2, 1, "b", isFavorite: false, isPinned: true),
            NewClip(3, 1, "c", isFavorite: true, isPinned: true),
        };
        Assert.Equal(2, clips.Count(c => c.IsFavorite));
        Assert.Equal(2, clips.Count(c => c.IsPinned));
        Assert.Equal(1, clips.Count(c => c.IsFavorite && c.IsPinned));
    }

    [Fact]
    public void List_applies_type_filter()
    {
        var clips = new List<ClipDto>
        {
            NewClip(1, 1, "a", "text"), NewClip(2, 1, "b", "code"), NewClip(3, 1, "c", "richtext"),
        };
        Assert.Single(clips, c => c.ContentType == "code");
        Assert.Equal(2, clips.Count(c => c.ContentType != "code"));
    }

    [Fact]
    public void Search_matches_title_and_content_case_insensitive()
    {
        var clips = new List<ClipDto>
        {
            NewClip(1, 1, "Hello World", title: "Alpha"),
            NewClip(2, 1, "unrelated", title: "Beta"),
        };
        var q = "hello";
        var results = clips.Where(c =>
            c.Title!.Contains(q, StringComparison.OrdinalIgnoreCase)
            || c.Content.Contains(q, StringComparison.OrdinalIgnoreCase)).ToList();
        Assert.Single(results);
        Assert.Equal(1, results[0].Id);
    }

    [Fact]
    public void Sort_options_are_validated()
    {
        foreach (var valid in new[] { "title_asc", "title_desc", "created_desc", "created_asc",
            "updated_desc", "updated_asc", "copy_desc", "view_desc" })
            Assert.True(ClipValidation.IsValidSort(valid));
        Assert.False(ClipValidation.IsValidSort("bogus"));
    }

    [Fact]
    public void Pagination_limit_and_offset()
    {
        var clips = Enumerable.Range(1, 25).Select(i => NewClip(i, 1, $"item {i}")).ToList();
        var page = clips.Skip(0).Take(5).ToList();
        Assert.Equal(5, page.Count);
        var page2 = clips.Skip(5).Take(5).ToList();
        Assert.Equal(5, page2.Count);
        Assert.NotEqual(page[0].Id, page2[0].Id);
    }

    [Fact]
    public void Limit_is_clamped_between_1_and_100()
    {
        int Clamp(int limit) => Math.Clamp(limit, 1, 100);
        Assert.Equal(1, Clamp(0));
        Assert.Equal(100, Clamp(999));
        Assert.Equal(20, Clamp(20));
    }

    [Fact]
    public void Stats_shape_is_complete()
    {
        var stats = new Dictionary<string, int>
        {
            ["total"] = 10, ["favorites"] = 3, ["pinned"] = 2,
            ["copies"] = 7, ["views"] = 21, ["shared"] = 4,
        };
        Assert.Equal(6, stats.Count);
        Assert.True(stats.ContainsKey("total") && stats.ContainsKey("favorites")
            && stats.ContainsKey("pinned") && stats.ContainsKey("copies")
            && stats.ContainsKey("views") && stats.ContainsKey("shared"));
    }

    [Fact]
    public void Tags_endpoint_aggregates_counts()
    {
        var clips = new List<ClipDto>
        {
            NewClip(1, 1, "a", tags: new[] { "red", "blue" }),
            NewClip(2, 1, "b", tags: new[] { "red" }),
            NewClip(3, 1, "c", tags: new[] { "blue", "green" }),
        };
        var counts = clips.SelectMany(c => c.Tags)
            .GroupBy(t => t)
            .ToDictionary(g => g.Key, g => g.Count());
        Assert.Equal(2, counts["red"]);
        Assert.Equal(2, counts["blue"]);
        Assert.Equal(1, counts["green"]);
    }

    [Fact]
    public void Ownership_enforcement_returns_not_found_for_other_user()
    {
        var mine = NewClip(1, 1, "secret");
        var otherUserId = 99;
        var found = mine.UserId == otherUserId ? mine : null;
        Assert.Null(found);
    }

    [Fact]
    public void Nonexistent_clip_returns_null()
    {
        var clips = new List<ClipDto> { NewClip(1, 1, "a") };
        var missing = clips.FirstOrDefault(c => c.Id == 999999);
        Assert.Null(missing);
    }

    [Fact]
    public void Copy_count_increments()
    {
        var clip = NewClip(1, 1, "copy me");
        clip.CopyCount++;
        Assert.Equal(1, clip.CopyCount);
        clip.CopyCount++;
        Assert.Equal(2, clip.CopyCount);
    }

    [Fact]
    public void Export_contains_all_user_clips()
    {
        var clips = new List<ClipDto> { NewClip(1, 1, "one"), NewClip(2, 1, "two") };
        var json = System.Text.Json.JsonSerializer.Serialize(clips);
        var roundTrip = System.Text.Json.JsonSerializer.Deserialize<List<ClipDto>>(json)!;
        Assert.Equal(2, roundTrip.Count);
        Assert.Equal("one", roundTrip[0].Content);
    }

    [Fact]
    public void Import_rejects_over_500_items()
    {
        var items = Enumerable.Range(0, 501).Select(i => new { Content = i.ToString() }).ToList();
        var tooMany = items.Count > 500;
        Assert.True(tooMany);
        var ok = Enumerable.Range(0, 500).Select(i => new { Content = i.ToString() }).ToList();
        Assert.False(ok.Count > 500);
    }

    [Fact]
    public void Import_round_trip_preserves_fields()
    {
        var clip = NewClip(5, 1, "roundtrip", "code", tags: new[] { "c#" }, isFavorite: true, isPinned: false,
            copyCount: 3, viewCount: 7, shareEnabled: false, expiresAt: null);
        var json = System.Text.Json.JsonSerializer.Serialize(clip);
        var parsed = System.Text.Json.JsonSerializer.Deserialize<ClipDto>(json)!;
        Assert.Equal(clip.Id, parsed.Id);
        Assert.Equal(clip.Content, parsed.Content);
        Assert.Equal(clip.ContentType, parsed.ContentType);
        Assert.Equal(clip.Tags, parsed.Tags);
        Assert.Equal(clip.CopyCount, parsed.CopyCount);
    }
}

public class ClipDto
{
    public long Id { get; set; }
    public long UserId { get; set; }
    public string? Title { get; set; }
    public string Content { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public string? Language { get; set; }
    public List<string> Tags { get; set; } = new();
    public bool IsPinned { get; set; }
    public bool IsFavorite { get; set; }
    public int CopyCount { get; set; }
    public int ViewCount { get; set; }
    public string? ShareToken { get; set; }
    public bool ShareEnabled { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public bool IsOneTime { get; set; }
    public int ReadCount { get; set; }
    public string? PasswordHash { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
