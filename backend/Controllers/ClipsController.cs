using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;
using OnlineClipboard.Models;
using OnlineClipboard.Services;
using OnlineClipboard.Models.Dto;
using OnlineClipboard.Middleware;

namespace OnlineClipboard.Controllers;

[ApiController]
[Route("api/clips")]
public class ClipsController : ControllerBase
{
    private readonly IMongoDbService _db;
    private readonly IJwtService _jwt;
    private readonly IPasswordService _password;
    private readonly IShareService _share;
    private readonly ISanitizationService _sanitizer;

    public ClipsController(IMongoDbService db, IJwtService jwt, IPasswordService password,
        IShareService share, ISanitizationService sanitizer)
    {
        _db = db;
        _jwt = jwt;
        _password = password;
        _share = share;
        _sanitizer = sanitizer;
    }

    private long? UserId => HttpContext.GetUserIdLong();

    private IActionResult UnauthorizedResult() =>
        Unauthorized(new { error = "unauthorized", message = "Authentication required" });

    private static ContentType ParseContentType(string? value)
    {
        return value switch
        {
            "richtext" => ContentType.Richtext,
            "code" => ContentType.Code,
            _ => ContentType.Text,
        };
    }

    private static ClipDto ToDto(Clip c, string? baseUrl = null)
    {
        var shareUrl = c.ShareEnabled && !string.IsNullOrEmpty(c.ShareToken)
            ? $"{baseUrl?.TrimEnd('/') ?? ""}/api/share/{c.ShareToken}"
            : null;
        return new ClipDto
        {
            Id = c.Id,
            UserId = c.UserId,
            Title = c.Title,
            Content = c.Content,
            Excerpt = c.Excerpt,
            ContentType = c.ContentType.ToString().ToLowerInvariant(),
            Language = c.Language,
            Tags = c.Tags,
            IsPinned = c.IsPinned,
            IsFavorite = c.IsFavorite,
            CopyCount = c.CopyCount,
            ViewCount = c.ViewCount,
            ShareToken = c.ShareToken,
            ShareEnabled = c.ShareEnabled,
            ExpiresAt = c.ExpiresAt,
            IsOneTime = c.IsOneTime,
            ReadCount = c.ReadCount,
            CreatedAt = c.CreatedAt,
            UpdatedAt = c.UpdatedAt,
            ShareUrl = shareUrl,
            HasPassword = !string.IsNullOrEmpty(c.PasswordHash),
        };
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string? q,
        [FromQuery] string? tag,
        [FromQuery] bool? favorite,
        [FromQuery] bool? pinned,
        [FromQuery] string? type,
        [FromQuery] string? sort,
        [FromQuery] int limit = 20,
        [FromQuery] int offset = 0)
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        limit = Math.Clamp(limit, 1, 100);
        offset = Math.Clamp(offset, 0, int.MaxValue);

        var filter = Builders<Clip>.Filter.Eq(c => c.UserId, userId.Value);

        if (!string.IsNullOrWhiteSpace(q))
        {
            var qLower = q.Trim().ToLowerInvariant();
            filter = Builders<Clip>.Filter.And(filter,
                Builders<Clip>.Filter.Or(
                    Builders<Clip>.Filter.Regex("title_lower", new MongoDB.Bson.BsonRegularExpression(qLower)),
                    Builders<Clip>.Filter.Regex("content", new MongoDB.Bson.BsonRegularExpression(qLower))));
        }

        if (!string.IsNullOrWhiteSpace(tag))
            filter = Builders<Clip>.Filter.And(filter, Builders<Clip>.Filter.Eq("tags", tag.Trim()));

        if (favorite.HasValue)
            filter = Builders<Clip>.Filter.And(filter, Builders<Clip>.Filter.Eq(c => c.IsFavorite, favorite.Value));
        if (pinned.HasValue)
            filter = Builders<Clip>.Filter.And(filter, Builders<Clip>.Filter.Eq(c => c.IsPinned, pinned.Value));
        if (!string.IsNullOrWhiteSpace(type))
            filter = Builders<Clip>.Filter.And(filter, Builders<Clip>.Filter.Eq(c => c.ContentType, ParseContentType(type)));

        var sortDef = sort switch
        {
            "title_asc" => Builders<Clip>.Sort.Ascending(c => c.Title),
            "title_desc" => Builders<Clip>.Sort.Descending(c => c.Title),
            "created_desc" => Builders<Clip>.Sort.Descending(c => c.CreatedAt),
            "created_asc" => Builders<Clip>.Sort.Ascending(c => c.CreatedAt),
            "updated_desc" => Builders<Clip>.Sort.Descending(c => c.UpdatedAt),
            "updated_asc" => Builders<Clip>.Sort.Ascending(c => c.UpdatedAt),
            "copy_desc" => Builders<Clip>.Sort.Descending(c => c.CopyCount),
            "view_desc" => Builders<Clip>.Sort.Descending(c => c.ViewCount),
            _ => Builders<Clip>.Sort.Descending(c => c.UpdatedAt),
        };

        var total = await _db.Clips.CountDocumentsAsync(filter);
        var items = await _db.Clips.Find(filter)
            .Sort(sortDef)
            .Skip(offset)
            .Limit(limit)
            .ToListAsync();

        return Ok(new { items = items.Select(c => ToDto(c, GetBaseUrl())), total });
    }

    [HttpGet("tags")]
    public async Task<IActionResult> Tags()
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        var pipeline = new List<MongoDB.Bson.BsonDocument>
        {
            new MongoDB.Bson.BsonDocument("$match", new MongoDB.Bson.BsonDocument("user_id", userId.Value)),
            new MongoDB.Bson.BsonDocument("$unwind", "$tags"),
            new MongoDB.Bson.BsonDocument("$group", new MongoDB.Bson.BsonDocument
            {
                { "_id", "$tags" },
                { "count", new MongoDB.Bson.BsonDocument("$sum", 1) }
            }),
            new MongoDB.Bson.BsonDocument("$sort", new MongoDB.Bson.BsonDocument("count", -1)),
        };

        var results = await _db.Clips.Aggregate<MongoDB.Bson.BsonDocument>(pipeline).ToListAsync();
        var tags = results.Select(r => new
        {
            tag = r["_id"].AsString,
            count = r["count"].AsInt32
        }).ToList();

        return Ok(new { tags });
    }

    [HttpGet("stats")]
    public async Task<IActionResult> Stats()
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        var clips = await _db.Clips.Find(c => c.UserId == userId.Value).ToListAsync();
        return Ok(new
        {
            total = clips.Count,
            favorites = clips.Count(c => c.IsFavorite),
            pinned = clips.Count(c => c.IsPinned),
            copies = clips.Sum(c => c.CopyCount),
            views = clips.Sum(c => c.ViewCount),
            shared = clips.Count(c => c.ShareEnabled),
        });
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export()
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        var items = await _db.Clips.Find(c => c.UserId == userId.Value)
            .SortByDescending(c => c.UpdatedAt)
            .ToListAsync();

        var json = System.Text.Json.JsonSerializer.Serialize(items.Select(c => ToDto(c, GetBaseUrl())),
            new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
            });

        return File(System.Text.Encoding.UTF8.GetBytes(json), "application/json", "clips-export.json");
    }

    [HttpPost("import")]
    public async Task<IActionResult> Import([FromBody] ImportRequest req)
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        if (req.Items == null || req.Items.Count == 0)
            return BadRequest(new { error = "validation_error", errors = new[] { "No items to import" } });
        if (req.Items.Count > 500)
            return BadRequest(new { error = "validation_error", errors = new[] { "Maximum 500 items per import" } });

        var imported = 0;
        var errors = new List<string>();

        foreach (var item in req.Items)
        {
            try
            {
                var content = _sanitizer.Sanitize(item.Content);
                var clip = new Clip
                {
                    Id = _db.NextId("clips"),
                    UserId = userId.Value,
                    Title = string.IsNullOrWhiteSpace(item.Title) ? "Untitled" : item.Title.Trim(),
                    TitleLower = (string.IsNullOrWhiteSpace(item.Title) ? "untitled" : item.Title.Trim()).ToLowerInvariant(),
                    Content = content,
                    Excerpt = content.Length > 200 ? content.Substring(0, 200) : content,
                    ContentType = ParseContentType(item.ContentType),
                    Language = item.Language,
                    Tags = item.Tags ?? new List<string>(),
                    IsPinned = item.IsPinned,
                    IsFavorite = item.IsFavorite,
                    ExpiresAt = item.ExpiresAt,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                };
                await _db.Clips.InsertOneAsync(clip);
                imported++;
            }
            catch (Exception ex)
            {
                errors.Add(ex.Message);
            }
        }

        return StatusCode(StatusCodes.Status201Created, new { imported, errors });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateClipRequest req)
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(req.Content))
            errors.Add("Content is required");
        else if (req.Content.Length > 100_000)
            errors.Add("Content too large (max 100KB)");
        if (!string.IsNullOrWhiteSpace(req.ContentType))
        {
            var ct = req.ContentType.Trim().ToLowerInvariant();
            if (ct != "text" && ct != "richtext" && ct != "code")
                errors.Add("Invalid content type");
        }
        if (req.Tags != null && req.Tags.Count > 10)
            errors.Add("Maximum 10 tags");

        if (errors.Count > 0)
            return BadRequest(new { error = "validation_error", errors });

        var content = req.Content;
        if (ParseContentType(req.ContentType) == ContentType.Richtext)
            content = _sanitizer.Sanitize(content);

        var title = string.IsNullOrWhiteSpace(req.Title) ? "Untitled" : req.Title.Trim();

        var clip = new Clip
        {
            Id = _db.NextId("clips"),
            UserId = userId.Value,
            Title = title,
            TitleLower = title.ToLowerInvariant(),
            Content = content,
            Excerpt = content.Length > 200 ? content.Substring(0, 200) : content,
            ContentType = ParseContentType(req.ContentType),
            Language = req.Language,
            Tags = req.Tags ?? new List<string>(),
            IsPinned = req.IsPinned,
            IsFavorite = req.IsFavorite,
            ExpiresAt = req.ExpiresAt,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        if (req.Share || !string.IsNullOrWhiteSpace(req.SharePassword) || req.ShareOneTime)
        {
            clip.ShareToken = _share.GenerateToken();
            clip.ShareEnabled = true;
            clip.IsOneTime = req.ShareOneTime;
            if (!string.IsNullOrWhiteSpace(req.SharePassword))
                clip.PasswordHash = _password.Hash(req.SharePassword, 10);
        }

        await _db.Clips.InsertOneAsync(clip);

        var dto = ToDto(clip, GetBaseUrl());
        return Created($"/api/clips/{clip.Id}", dto);
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> Get(long id)
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        var clip = await _db.Clips.Find(c => c.Id == id && c.UserId == userId.Value).FirstOrDefaultAsync();
        if (clip == null)
            return NotFound(new { error = "not_found", message = "Clip not found" });

        return Ok(ToDto(clip, GetBaseUrl()));
    }

    [HttpPatch("{id:long}")]
    public async Task<IActionResult> Update(long id, [FromBody] ClipUpdateRequest req)
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        var clip = await _db.Clips.Find(c => c.Id == id && c.UserId == userId.Value).FirstOrDefaultAsync();
        if (clip == null)
            return NotFound(new { error = "not_found", message = "Clip not found" });

        var update = Builders<Clip>.Update.Set(c => c.UpdatedAt, DateTime.UtcNow);

        if (req.Title != null)
        {
            update = update.Set(c => c.Title, req.Title.Trim())
                .Set(c => c.TitleLower, req.Title.Trim().ToLowerInvariant());
        }
        if (req.Content != null)
        {
            var content = ParseContentType(req.ContentType) == ContentType.Richtext
                ? _sanitizer.Sanitize(req.Content)
                : req.Content;
            update = update.Set(c => c.Content, content)
                .Set(c => c.Excerpt, content.Length > 200 ? content.Substring(0, 200) : content);
        }
        if (req.ContentType != null)
            update = update.Set(c => c.ContentType, ParseContentType(req.ContentType));
        if (req.Language != null)
            update = update.Set(c => c.Language, req.Language);
        if (req.Tags != null)
            update = update.Set(c => c.Tags, req.Tags);
        if (req.IsPinned.HasValue)
            update = update.Set(c => c.IsPinned, req.IsPinned.Value);
        if (req.IsFavorite.HasValue)
            update = update.Set(c => c.IsFavorite, req.IsFavorite.Value);
        if (req.ExpiresAt.HasValue)
            update = update.Set(c => c.ExpiresAt, req.ExpiresAt.Value);

        await _db.Clips.UpdateOneAsync(c => c.Id == id && c.UserId == userId.Value, update);
        var updated = await _db.Clips.Find(c => c.Id == id && c.UserId == userId.Value).FirstOrDefaultAsync();

        return Ok(ToDto(updated!, GetBaseUrl()));
    }

    [HttpPatch("{id:long}/copy")]
    public async Task<IActionResult> Copy(long id)
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        var clip = await _db.Clips.Find(c => c.Id == id && c.UserId == userId.Value).FirstOrDefaultAsync();
        if (clip == null)
            return NotFound(new { error = "not_found", message = "Clip not found" });

        await _db.Clips.UpdateOneAsync(
            c => c.Id == id && c.UserId == userId.Value,
            Builders<Clip>.Update.Inc(c => c.CopyCount, 1));

        return Ok(new { ok = true });
    }

    [HttpPatch("{id:long}/flags")]
    public async Task<IActionResult> Flags(long id, [FromBody] FlagsRequest req)
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        var clip = await _db.Clips.Find(c => c.Id == id && c.UserId == userId.Value).FirstOrDefaultAsync();
        if (clip == null)
            return NotFound(new { error = "not_found", message = "Clip not found" });

        var update = Builders<Clip>.Update.Set(c => c.UpdatedAt, DateTime.UtcNow);
        if (req.IsFavorite.HasValue)
            update = update.Set(c => c.IsFavorite, req.IsFavorite.Value);
        if (req.IsPinned.HasValue)
            update = update.Set(c => c.IsPinned, req.IsPinned.Value);

        await _db.Clips.UpdateOneAsync(c => c.Id == id && c.UserId == userId.Value, update);
        var updated = await _db.Clips.Find(c => c.Id == id && c.UserId == userId.Value).FirstOrDefaultAsync();

        return Ok(ToDto(updated!, GetBaseUrl()));
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id)
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        var result = await _db.Clips.DeleteOneAsync(c => c.Id == id && c.UserId == userId.Value);
        if (result.DeletedCount == 0)
            return NotFound(new { error = "not_found", message = "Clip not found" });

        return Ok(new { ok = true });
    }

    [HttpPost("{id:long}/share")]
    public async Task<IActionResult> Share(long id, [FromBody] ShareRequest req)
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        var clip = await _db.Clips.Find(c => c.Id == id && c.UserId == userId.Value).FirstOrDefaultAsync();
        if (clip == null)
            return NotFound(new { error = "not_found", message = "Clip not found" });

        var update = Builders<Clip>.Update.Set(c => c.UpdatedAt, DateTime.UtcNow);

        if (req.Enabled.HasValue)
            update = update.Set(c => c.ShareEnabled, req.Enabled.Value);
        if (req.OneTime.HasValue)
            update = update.Set(c => c.IsOneTime, req.OneTime.Value);

        if (req.Rotate || string.IsNullOrEmpty(clip.ShareToken))
        {
            update = update.Set(c => c.ShareToken, _share.GenerateToken());
        }

        if (req.ClearPassword)
        {
            update = update.Unset(c => c.PasswordHash!);
        }
        else if (!string.IsNullOrWhiteSpace(req.Password))
        {
            update = update.Set(c => c.PasswordHash, _password.Hash(req.Password, 10));
        }

        await _db.Clips.UpdateOneAsync(c => c.Id == id && c.UserId == userId.Value, update);
        var updated = await _db.Clips.Find(c => c.Id == id && c.UserId == userId.Value).FirstOrDefaultAsync();

        return Ok(ToDto(updated!, GetBaseUrl()));
    }

    [HttpGet("{id:long}/qr")]
    public IActionResult Qr(long id)
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        var url = $"{GetBaseUrl()}/api/clips/{id}";
        var bytes = _share.GenerateQrCode(url);
        return File(bytes, "image/png");
    }

    [HttpGet("{id:long}/export")]
    public async Task<IActionResult> ExportClip(long id, [FromQuery] string format = "txt")
    {
        var userId = UserId;
        if (!userId.HasValue) return UnauthorizedResult();

        var clip = await _db.Clips.Find(c => c.Id == id && c.UserId == userId.Value).FirstOrDefaultAsync();
        if (clip == null)
            return NotFound(new { error = "not_found", message = "Clip not found" });

        var content = format.ToLowerInvariant() switch
        {
            "html" => $"<html><body><pre>{System.Net.WebUtility.HtmlEncode(clip.Content)}</pre></body></html>",
            "md" => $"# {clip.Title}\n\n{clip.Content}",
            _ => clip.Content,
        };

        var ext = format.ToLowerInvariant() switch
        {
            "html" => "html",
            "md" => "md",
            _ => "txt",
        };
        var mime = ext switch
        {
            "html" => "text/html",
            "md" => "text/markdown",
            _ => "text/plain",
        };

        return File(System.Text.Encoding.UTF8.GetBytes(content), mime, $"{clip.Title}.{ext}");
    }

    private string GetBaseUrl()
    {
        var req = HttpContext.Request;
        return $"{req.Scheme}://{req.Host}";
    }

    public class ImportRequest
    {
        public List<ImportItem> Items { get; set; } = new();
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

    public class ShareRequest
    {
        public bool? Enabled { get; set; }
        public bool? OneTime { get; set; }
        public bool Rotate { get; set; }
        public string? Password { get; set; }
        public bool ClearPassword { get; set; }
    }

    public class FlagsRequest
    {
        public bool? IsFavorite { get; set; }
        public bool? IsPinned { get; set; }
    }
}
