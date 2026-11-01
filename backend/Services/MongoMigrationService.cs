using System.Text.Json;
using MongoDB.Bson;
using MongoDB.Driver;
using OnlineClipboard.Models;

namespace OnlineClipboard.Services;

public class MongoMigrationService
{
    private readonly IMongoDbService _mongo;
    private readonly ILogger<MongoMigrationService> _logger;
    private readonly string _exportPath;

    public MongoMigrationService(IMongoDbService mongo, ILogger<MongoMigrationService> logger, string? exportPath = null)
    {
        _mongo = mongo;
        _logger = logger;
        _exportPath = exportPath ?? "/tmp/opencode/sqlite_export.json";
    }

    public async Task<MigrationResult> MigrateAsync(CancellationToken ct = default)
    {
        if (!File.Exists(_exportPath))
        {
            _logger.LogWarning("Export file not found at {Path}; skipping migration", _exportPath);
            return new MigrationResult { Skipped = true };
        }

        var json = await File.ReadAllTextAsync(_exportPath, ct);
        var export = JsonSerializer.Deserialize<SqliteExport>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("Failed to parse sqlite export json");

        _mongo.Connect();
        var db = _mongo.GetDatabase();

        // Seed counters from existing max ids so NextId continues after migrated ids.
        await SeedCountersAsync(db, export, ct);

        var usersResult = await MigrateUsersAsync(db, export.Users, ct);
        var clipsResult = await MigrateClipsAsync(db, export.ClipboardItems, ct);
        var auditResult = await MigrateAuditLogAsync(db, export.AuditLog, ct);

        _logger.LogInformation("Migration complete: users={Users}, clips={Clips}, audit={Audit}",
            usersResult.Upserted, clipsResult.Upserted, auditResult.Upserted);

        return new MigrationResult
        {
            Users = usersResult.Upserted,
            Clips = clipsResult.Upserted,
            AuditLog = auditResult.Upserted,
            Skipped = false
        };
    }

    private static async Task SeedCountersAsync(IMongoDatabase db, SqliteExport export, CancellationToken ct)
    {
        var counters = db.GetCollection<Counter>("counters");

        static long MaxId<T>(IEnumerable<T>? items, Func<T, long> idSelector)
        {
            if (items == null) return 0;
            long max = 0;
            foreach (var item in items)
            {
                var id = idSelector(item);
                if (id > max) max = id;
            }
            return max;
        }

        var countersToSet = new List<Counter>
        {
            new Counter { Id = "users", Seq = MaxId(export.Users, u => u.Id) },
            new Counter { Id = "clips", Seq = MaxId(export.ClipboardItems, c => c.Id) },
            new Counter { Id = "audit_log", Seq = MaxId(export.AuditLog, a => a.Id) },
        };

        foreach (var counter in countersToSet)
        {
            var filter = Builders<Counter>.Filter.Eq(c => c.Id, counter.Id);
            var existing = await counters.Find(filter).FirstOrDefaultAsync(ct);
            if (existing == null || counter.Seq > existing.Seq)
            {
                await counters.ReplaceOneAsync(filter, counter, new ReplaceOptions { IsUpsert = true });
            }
        }
    }

    private static async Task<MutationResult> MigrateUsersAsync(IMongoDatabase db, List<SqliteUser>? users, CancellationToken ct)
    {
        var collection = db.GetCollection<User>("users");
        int upserted = 0;
        if (users == null) return new MutationResult();

        foreach (var u in users)
        {
            var doc = new User
            {
                Id = u.Id,
                Username = u.Username ?? string.Empty,
                Email = u.Email ?? string.Empty,
                UsernameLower = (u.Username ?? string.Empty).ToLowerInvariant(),
                EmailLower = (u.Email ?? string.Empty).ToLowerInvariant(),
                PasswordHash = u.PasswordHash ?? string.Empty,
                TokenVersion = u.TokenVersion,
                CreatedAt = ParseDate(u.CreatedAt),
                UpdatedAt = ParseDate(u.UpdatedAt)
            };
            var filter = Builders<User>.Filter.Eq(x => x.Id, u.Id);
            await collection.ReplaceOneAsync(filter, doc, new ReplaceOptions { IsUpsert = true });
            upserted++;
        }
        return new MutationResult { Upserted = upserted };
    }

    private static async Task<MutationResult> MigrateClipsAsync(IMongoDatabase db, List<SqliteClip>? clips, CancellationToken ct)
    {
        var collection = db.GetCollection<Clip>("clips");
        int upserted = 0;
        if (clips == null) return new MutationResult();

        foreach (var c in clips)
        {
            var tags = ParseTags(c.Tags);
            var doc = new Clip
            {
                Id = c.Id,
                UserId = c.UserId,
                Title = c.Title ?? string.Empty,
                TitleLower = (c.Title ?? string.Empty).ToLowerInvariant(),
                Content = c.Content ?? string.Empty,
                Excerpt = c.Excerpt ?? string.Empty,
                ContentType = ParseContentType(c.ContentType),
                Language = c.Language,
                Tags = tags,
                IsPinned = c.IsPinned != 0,
                IsFavorite = c.IsFavorite != 0,
                CopyCount = c.CopyCount,
                ViewCount = c.ViewCount,
                ShareToken = c.ShareToken,
                ShareEnabled = c.ShareEnabled != 0,
                ExpiresAt = ParseNullableDate(c.ExpiresAt),
                IsOneTime = c.IsOneTime != 0,
                ReadCount = c.ReadCount,
                PasswordHash = c.PasswordHash,
                CreatedAt = ParseDate(c.CreatedAt),
                UpdatedAt = ParseDate(c.UpdatedAt)
            };
            var filter = Builders<Clip>.Filter.Eq(x => x.Id, c.Id);
            await collection.ReplaceOneAsync(filter, doc, new ReplaceOptions { IsUpsert = true });
            upserted++;
        }
        return new MutationResult { Upserted = upserted };
    }

    private static async Task<MutationResult> MigrateAuditLogAsync(IMongoDatabase db, List<SqliteAuditLog>? audit, CancellationToken ct)
    {
        var collection = db.GetCollection<AuditLog>("audit_log");
        int upserted = 0;
        if (audit == null) return new MutationResult();

        foreach (var a in audit)
        {
            var doc = new AuditLog
            {
                Id = a.Id,
                UserId = a.UserId,
                Action = a.Action ?? string.Empty,
                Detail = a.Detail,
                Ip = a.Ip,
                CreatedAt = ParseDate(a.CreatedAt)
            };
            var filter = Builders<AuditLog>.Filter.Eq(x => x.Id, a.Id);
            await collection.ReplaceOneAsync(filter, doc, new ReplaceOptions { IsUpsert = true });
            upserted++;
        }
        return new MutationResult { Upserted = upserted };
    }

    private static List<string> ParseTags(string? tags)
    {
        if (string.IsNullOrWhiteSpace(tags)) return new();
        try
        {
            var parsed = JsonSerializer.Deserialize<List<string>>(tags, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (parsed != null) return parsed;
        }
        catch { }
        return tags.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                   .Select(t => t.Trim('"', ' '))
                   .Where(t => t.Length > 0)
                   .ToList();
    }

    private static ContentType ParseContentType(string? type)
    {
        return type switch
        {
            "richtext" => ContentType.Richtext,
            "code" => ContentType.Code,
            _ => ContentType.Text
        };
    }

    private static DateTime ParseDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return DateTime.UtcNow;
        if (DateTimeOffset.TryParse(value, out var dto)) return dto.UtcDateTime;
        return DateTime.UtcNow;
    }

    private static DateTime? ParseNullableDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (DateTimeOffset.TryParse(value, out var dto)) return dto.UtcDateTime;
        return null;
    }

    // Shapes matching the sqlite export file.
    private class SqliteExport
    {
        public List<SqliteUser>? Users { get; set; }
        public List<SqliteClip>? ClipboardItems { get; set; }
        public List<SqliteAuditLog>? AuditLog { get; set; }
    }

    private class SqliteUser
    {
        public long Id { get; set; }
        public string? Username { get; set; }
        public string? Email { get; set; }
        public string? PasswordHash { get; set; }
        public int TokenVersion { get; set; }
        public string? CreatedAt { get; set; }
        public string? UpdatedAt { get; set; }
    }

    private class SqliteClip
    {
        public long Id { get; set; }
        public long UserId { get; set; }
        public string? Title { get; set; }
        public string? Content { get; set; }
        public string? ContentType { get; set; }
        public string? Language { get; set; }
        public string? Excerpt { get; set; }
        public string? Tags { get; set; }
        public int IsPinned { get; set; }
        public int IsFavorite { get; set; }
        public int CopyCount { get; set; }
        public int ViewCount { get; set; }
        public string? ShareToken { get; set; }
        public int ShareEnabled { get; set; }
        public string? ExpiresAt { get; set; }
        public int IsOneTime { get; set; }
        public int ReadCount { get; set; }
        public string? PasswordHash { get; set; }
        public string? CreatedAt { get; set; }
        public string? UpdatedAt { get; set; }
    }

    private class SqliteAuditLog
    {
        public long Id { get; set; }
        public long? UserId { get; set; }
        public string? Action { get; set; }
        public string? Detail { get; set; }
        public string? Ip { get; set; }
        public string? CreatedAt { get; set; }
    }

    public class MigrationResult
    {
        public bool Skipped { get; set; }
        public int Users { get; set; }
        public int Clips { get; set; }
        public int AuditLog { get; set; }
    }

    private class MutationResult
    {
        public int Upserted { get; set; }
    }
}
