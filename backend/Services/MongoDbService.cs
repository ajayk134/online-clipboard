using System.Net;
using MongoDB.Bson;
using MongoDB.Driver;
using OnlineClipboard.Models;

namespace OnlineClipboard.Services;

public class MongoDbService : IMongoDbService, IAsyncDisposable
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<MongoDbService> _logger;
    private IMongoClient? _client;
    private IMongoDatabase? _database;
    private readonly string _databaseName;
    private readonly string? _connectionString;

    public MongoDbService(IConfiguration configuration, ILogger<MongoDbService> logger)
    {
        _configuration = configuration;
        _logger = logger;
        _connectionString = Environment.GetEnvironmentVariable("MONGODB_URI")
            ?? configuration["MongoDb:Uri"];
        _databaseName = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") == "Testing"
            ? "online_clipboard_test"
            : (Environment.GetEnvironmentVariable("MONGODB_DATABASE")
               ?? configuration["MongoDb:Database"]
               ?? "online_clipboard");
    }

    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        if (_client != null && _database != null) return;

        var uri = _connectionString ?? throw new InvalidOperationException("MONGODB_URI is not configured");

        var settings = MongoClientSettings.FromConnectionString(uri);
        // Production-grade connection tuning with sensible defaults.
        if (settings.ServerSelectionTimeout == Timeout.InfiniteTimeSpan)
        {
            settings.ServerSelectionTimeout = TimeSpan.FromSeconds(
                int.TryParse(Environment.GetEnvironmentVariable("MONGODB_TIMEOUT_MS"), out var timeoutMs) && timeoutMs > 0
                    ? timeoutMs
                    : 15);
        }
        if (settings.MaxConnectionPoolSize == 0)
        {
            settings.MaxConnectionPoolSize = int.TryParse(Environment.GetEnvironmentVariable("MONGODB_POOL_SIZE"), out var poolSize) && poolSize > 0
                ? poolSize
                : 100;
        }

        _client = new MongoClient(settings);
        _database = _client.GetDatabase(_databaseName);

        // Verify the connection actually works.
        await _database.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1), ReadPreference.Primary, cancellationToken)
            .ConfigureAwait(false);

        _logger.LogInformation("Connected to MongoDB database {Database}", _databaseName);
    }

    public void Connect()
    {
        ConnectAsync().GetAwaiter().GetResult();
    }

    public IMongoDatabase GetDatabase() => _database ?? throw new InvalidOperationException("MongoDB not connected. Call Connect() first.");

    public void Close()
    {
        _logger.LogInformation("MongoDB client reference released.");
    }

    public bool Ping()
    {
        try
        {
            var db = GetDatabase();
            var result = db.RunCommand<BsonDocument>(new BsonDocument("ping", 1));
            return result.Contains("ok") && result["ok"].ToDouble() == 1;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "MongoDB ping failed");
            return false;
        }
    }

    public async Task<bool> PingAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var db = GetDatabase();
            var result = await db.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1), ReadPreference.Primary, cancellationToken)
                .ConfigureAwait(false);
            return result.Contains("ok") && result["ok"].ToDouble() == 1;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "MongoDB ping failed");
            return false;
        }
    }

    public long NextId(string collectionName)
    {
        var counters = GetDatabase().GetCollection<Counter>("counters");
        var filter = Builders<Counter>.Filter.Eq(c => c.Id, collectionName);
        var update = Builders<Counter>.Update.Inc(c => c.Seq, 1);
        var options = new FindOneAndUpdateOptions<Counter>
        {
            IsUpsert = true,
            ReturnDocument = ReturnDocument.After,
        };
        var counter = counters.FindOneAndUpdate(filter, update, options);
        return counter?.Seq ?? 0;
    }

    public async Task EnsureIndexesAsync(CancellationToken cancellationToken = default)
    {
        var db = GetDatabase();

        // users
        var users = db.GetCollection<User>("users");
        await CreateIndexesWithFallback(users, new[]
        {
            new CreateIndexModel<User>(Builders<User>.IndexKeys.Ascending(u => u.Id), new CreateIndexOptions { Name = "ux_users_id" }),
            new CreateIndexModel<User>(Builders<User>.IndexKeys.Ascending(u => u.UsernameLower), new CreateIndexOptions { Unique = true, Name = "ux_users_username_lower" }),
            new CreateIndexModel<User>(Builders<User>.IndexKeys.Ascending(u => u.EmailLower), new CreateIndexOptions { Unique = true, Name = "ux_users_email_lower" }),
        }, cancellationToken).ConfigureAwait(false);

        // clips
        var clips = db.GetCollection<Clip>("clips");
        await CreateIndexesWithFallback(clips, new[]
        {
            new CreateIndexModel<Clip>(Builders<Clip>.IndexKeys.Ascending(c => c.Id), new CreateIndexOptions { Name = "ux_clips_id" }),
            new CreateIndexModel<Clip>(Builders<Clip>.IndexKeys.Ascending(c => c.UserId).Ascending(c => c.CreatedAt), new CreateIndexOptions { Name = "ix_clips_user_created" }),
            new CreateIndexModel<Clip>(Builders<Clip>.IndexKeys.Ascending(c => c.UserId).Ascending(c => c.IsPinned).Descending(c => c.UpdatedAt), new CreateIndexOptions { Name = "ix_clips_user_pinned_updated" }),
            new CreateIndexModel<Clip>(Builders<Clip>.IndexKeys.Ascending(c => c.ShareToken), new CreateIndexOptions { Sparse = true, Name = "ix_clips_share_token" }),
            // TTL index: automatically expire clips whose ExpiresAt has passed.
            new CreateIndexModel<Clip>(Builders<Clip>.IndexKeys.Ascending(c => c.ExpiresAt), new CreateIndexOptions { Name = "ix_clips_expires_at", ExpireAfter = TimeSpan.Zero }),
            new CreateIndexModel<Clip>(Builders<Clip>.IndexKeys.Ascending(c => c.UserId).Ascending(c => c.Tags), new CreateIndexOptions { Name = "ix_clips_user_tags" }),
        }, cancellationToken).ConfigureAwait(false);

        // audit_log
        var audit = db.GetCollection<AuditLog>("audit_log");
        await CreateIndexesWithFallback(audit, new[]
        {
            new CreateIndexModel<AuditLog>(Builders<AuditLog>.IndexKeys.Ascending(a => a.Id), new CreateIndexOptions { Name = "ux_audit_id" }),
            new CreateIndexModel<AuditLog>(Builders<AuditLog>.IndexKeys.Ascending(a => a.UserId).Ascending(a => a.CreatedAt), new CreateIndexOptions { Name = "ix_audit_user_created" }),
        }, cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("MongoDB indexes ensured.");
    }

    public void EnsureIndexes()
    {
        EnsureIndexesAsync().GetAwaiter().GetResult();
    }

    private static async Task CreateIndexesWithFallback<T>(IMongoCollection<T> collection, IEnumerable<CreateIndexModel<T>> models, CancellationToken cancellationToken)
    {
        foreach (var model in models)
        {
            try
            {
                await collection.Indexes.CreateOneAsync(model, null, cancellationToken).ConfigureAwait(false);
            }
            catch (MongoCommandException ex) when (ex.Code == 86 || ex.Code == 87)
            {
                // IndexOptionsConflict (86) or IndexKeySpecsConflict (87): index exists with different options.
                // Log and continue rather than crashing startup.
            }
            catch
            {
                // Log non-fatal index errors; do not crash startup.
            }
        }
    }

    public IMongoCollection<T> GetCollection<T>(string name) where T : class => GetDatabase().GetCollection<T>(name);

    public IMongoCollection<User> Users => GetDatabase().GetCollection<User>("users");
    public IMongoCollection<Clip> Clips => GetDatabase().GetCollection<Clip>("clips");
    public IMongoCollection<AuditLog> AuditLog => GetDatabase().GetCollection<AuditLog>("audit_log");

    public async ValueTask DisposeAsync()
    {
        _client = null;
        _database = null;
        GC.SuppressFinalize(this);
    }

    public void Dispose()
    {
        _client = null;
        _database = null;
        GC.SuppressFinalize(this);
    }
}
