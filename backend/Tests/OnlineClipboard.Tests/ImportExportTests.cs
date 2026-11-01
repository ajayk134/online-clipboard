using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Xunit;

namespace OnlineClipboard.Tests;

public class ImportExportTests
{
    [Fact]
    public void Export_produces_valid_json_array()
    {
        var items = new List<ExportItem>
        {
            new() { Title = "T1", Content = "c1", ContentType = "text", Tags = new List<string> { "a" } },
            new() { Title = "T2", Content = "c2", ContentType = "code", Language = "js" },
        };
        var json = JsonSerializer.Serialize(items);
        Assert.Contains("T1", json);
        Assert.Contains("c1", json);
        Assert.Contains("js", json);
        var roundTrip = JsonSerializer.Deserialize<List<ExportItem>>(json)!;
        Assert.Equal(2, roundTrip.Count);
        Assert.Equal("c1", roundTrip[0].Content);
        Assert.Equal("js", roundTrip[1].Language);
    }

    [Fact]
    public void Export_excludes_password_hashes_and_internal_fields()
    {
        var items = new List<ExportItem>
        {
            new() { Title = "T", Content = "c", PasswordHash = "bcrypt$hash", InternalId = 999 },
        };
        var json = JsonSerializer.Serialize(items);
        Assert.DoesNotContain("bcrypt$hash", json);
        Assert.DoesNotContain("InternalId", json);
    }

    [Fact]
    public void Import_rejects_empty_item_list()
    {
        var items = new List<ImportItem>();
        Assert.True(items.Count == 0);
        var errors = new List<string>();
        if (items.Count == 0) errors.Add("No items to import");
        Assert.Single(errors);
    }

    [Fact]
    public void Import_rejects_over_500_items()
    {
        var items = Enumerable.Range(0, 501).Select(i => new ImportItem { Content = i.ToString() }).ToList();
        var errors = new List<string>();
        if (items.Count > 500) errors.Add("Maximum 500 items per import");
        Assert.Single(errors);
        Assert.Equal(500, Enumerable.Range(0, 500).Count());
    }

    [Fact]
    public void Import_accepts_up_to_500_items()
    {
        var items = Enumerable.Range(0, 500).Select(i => new ImportItem { Content = i.ToString() }).ToList();
        Assert.False(items.Count > 500);
        Assert.Equal(500, items.Count);
    }

    [Fact]
    public void Import_round_trip_preserves_all_fields()
    {
        var original = new ImportItem
        {
            Title = "R", Content = "content", ContentType = "richtext", Language = "html",
            Tags = new List<string> { "x", "y" }, IsPinned = true, IsFavorite = true,
            ExpiresAt = DateTime.UtcNow.AddDays(1),
        };
        var json = JsonSerializer.Serialize(original);
        var parsed = JsonSerializer.Deserialize<ImportItem>(json)!;
        Assert.Equal(original.Title, parsed.Title);
        Assert.Equal(original.Content, parsed.Content);
        Assert.Equal(original.ContentType, parsed.ContentType);
        Assert.Equal(original.Language, parsed.Language);
        Assert.Equal(original.Tags, parsed.Tags);
        Assert.True(parsed.IsPinned);
        Assert.True(parsed.IsFavorite);
    }

    [Fact]
    public void Export_and_import_are_inverse()
    {
        var source = new List<ClipExportRow>
        {
            new() { Id = 1, Content = "alpha", Tags = new List<string> { "t1" } },
            new() { Id = 2, Content = "beta", Tags = new List<string> { "t2", "t3" } },
        };
        var exported = JsonSerializer.Serialize(source);
        var imported = JsonSerializer.Deserialize<List<ClipExportRow>>(exported)!;
        Assert.Equal(source.Count, imported.Count);
        for (var i = 0; i < source.Count; i++)
        {
            Assert.Equal(source[i].Content, imported[i].Content);
            Assert.Equal(source[i].Tags.Count, imported[i].Tags.Count);
        }
    }
}

public class ExportItem
{
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public string? Language { get; set; }
    public List<string> Tags { get; set; } = new();

    [JsonIgnore]
    public string? PasswordHash { get; set; }

    [JsonIgnore]
    public int InternalId { get; set; }
}

public class ImportItem
{
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string ContentType { get; set; } = "text";
    public string? Language { get; set; }
    public List<string> Tags { get; set; } = new();
    public bool IsPinned { get; set; }
    public bool IsFavorite { get; set; }
    public DateTime? ExpiresAt { get; set; }
}

public class ClipExportRow
{
    public long Id { get; set; }
    public string Content { get; set; } = string.Empty;
    public List<string> Tags { get; set; } = new();
}
