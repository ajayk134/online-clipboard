using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;
using OnlineClipboard.Models;
using OnlineClipboard.Services;
using Xunit;

namespace OnlineClipboard.Tests;

public class MongoDbIntegrationTests
{
    private static readonly string? _connectionString = Environment.GetEnvironmentVariable("MONGODB_URI");

    private static bool IsConfigured => !string.IsNullOrEmpty(_connectionString);

    private static bool RequireConfigured()
    {
        return IsConfigured;
    }

    private IMongoDbService NewService()
    {
        Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT", "Testing");
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["MongoDb:Uri"] = _connectionString!,
                ["MongoDb:Database"] = "online_clipboard_test",
            }).Build();
        var service = new MongoDbService(config, new Logger<MongoDbService>(new LoggerFactory()));
        service.Connect();
        return service;
    }

    [Fact]
    public void Connect_and_ping_succeeds()
    {
        if (!RequireConfigured()) return;
        var service = NewService();
        Assert.True(service.Ping());
    }

    [Fact]
    public void EnsureIndexes_creates_expected_indexes()
    {
        if (!RequireConfigured()) return;
        var service = NewService();
        service.EnsureIndexes();

        var userIndexNames = IndexNames(service.GetDatabase(), "users");
        Assert.Contains("ux_users_id", userIndexNames);
        Assert.Contains("ux_users_username_lower", userIndexNames);
        Assert.Contains("ux_users_email_lower", userIndexNames);

        var clipIndexNames = IndexNames(service.GetDatabase(), "clips");
        Assert.Contains("ux_clips_id", clipIndexNames);
        Assert.Contains("ux_clips_share_token", clipIndexNames);
        Assert.Contains("ix_clips_expires_at", clipIndexNames);

        var auditIndexNames = IndexNames(service.GetDatabase(), "audit_log");
        Assert.Contains("ux_audit_id", auditIndexNames);
    }

    [Fact]
    public void NextId_returns_sequential_ids()
    {
        if (!RequireConfigured()) return;
        var service = NewService();
        Assert.Equal(1L, service.NextId("integration_nextid"));
        Assert.Equal(2L, service.NextId("integration_nextid"));
        Assert.Equal(3L, service.NextId("integration_nextid"));
    }

    [Fact]
    public async Task Migration_is_idempotent_and_preserves_ids()
    {
        if (!RequireConfigured()) return;
        var service = NewService();
        var migration = new MongoMigrationService(
            service, new Logger<MongoMigrationService>(new LoggerFactory()));

        var r1 = await migration.MigrateAsync();
        Assert.False(r1.Skipped);
        Assert.Equal(16L, CountUsers(service));
        Assert.Equal(21L, CountClips(service));
        Assert.Equal(88L, CountAudit(service));

        var r2 = await migration.MigrateAsync();
        Assert.Equal(16L, CountUsers(service));
        Assert.Equal(21L, CountClips(service));
        Assert.Equal(88L, CountAudit(service));

        Assert.Equal(17L, service.NextId("users"));
        Assert.Equal(22L, service.NextId("clips"));
        Assert.Equal(23L, service.NextId("clips"));
    }

    private static long CountUsers(IMongoDbService service) =>
        service.GetCollection<User>("users").CountDocuments(_ => true);

    private static long CountClips(IMongoDbService service) =>
        service.GetCollection<Clip>("clips").CountDocuments(_ => true);

    private static long CountAudit(IMongoDbService service) =>
        service.GetCollection<AuditLog>("audit_log").CountDocuments(_ => true);

    private static HashSet<string> IndexNames(IMongoDatabase db, string collection)
    {
        return db.GetCollection<BsonDocument>(collection)
            .Indexes.List().ToList()
            .Select(d => d["name"].AsString)
            .ToHashSet();
    }
}
