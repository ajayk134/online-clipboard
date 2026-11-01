using System.Net;
using MongoDB.Bson;
using MongoDB.Driver;
using OnlineClipboard.Models;

namespace OnlineClipboard.Services;

public class MongoDbService : IMongoDbService, IDisposable
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

    public void Connect()
    {
        if (_client != null) return;

        var uri = _connectionString ?? throw new InvalidOperationException("MONGODB_URI is not configured");
        _client = new MongoClient(uri);
        _database = _client.GetDatabase(_databaseName);
        _logger.LogInformation("Connected to MongoDB database {Database}", _databaseName);
    }

    public IMongoDatabase GetDatabase() => _database ?? throw new InvalidOperationException("MongoDB not connected. Call Connect() first.");

    public void Close()
    {
        // MongoClient does not expose an explicit close; dispose is handled via Dispose.
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

    public long NextId(string collectionName)
    {
        var counters = GetDatabase().GetCollection<Counter>("counters");
        var filter = Builders<Counter>.Filter.Eq(c => c.Id, collectionName);
        var update = Builders<Counter>.Update.Inc(c => c.Seq, 1);
        var options = new FindOneAndUpdateOptions<Counter>
        {
            IsUpsert = true,
            ReturnDocument = ReturnDocument.After
        };
        var counter = counters.FindOneAndUpdate(filter, update, options);
        return counter?.Seq ?? 1;
    }

    public void EnsureIndexes()
    {
        var db = GetDatabase();

        // users
        var users = db.GetCollection<User>("users");
        users.Indexes.CreateMany(new[]
        {
            new CreateIndexModel<User>(Builders<User>.IndexKeys.Ascending(u => u.Id), new CreateIndexOptions { Unique = true, Name = "ux_users_id" }),
            new CreateIndexModel<User>(Builders<User>.IndexKeys.Ascending(u => u.UsernameLower), new CreateIndexOptions { Unique = true, Name = "ux_users_username_lower" }),
            new CreateIndexModel<User>(Builders<User>.IndexKeys.Ascending(u => u.EmailLower), new CreateIndexOptions { Unique = true, Name = "ux_users_email_lower" }),
        });

        // clips
        var clips = db.GetCollection<Clip>("clips");
        clips.Indexes.CreateMany(new[]
        {
            new CreateIndexModel<Clip>(Builders<Clip>.IndexKeys.Ascending(c => c.Id), new CreateIndexOptions { Unique = true, Name = "ux_clips_id" }),
            new CreateIndexModel<Clip>(Builders<Clip>.IndexKeys.Ascending(c => c.UserId).Ascending(c => c.CreatedAt), new CreateIndexOptions { Name = "ix_clips_user_created" }),
            new CreateIndexModel<Clip>(Builders<Clip>.IndexKeys.Ascending(c => c.UserId).Ascending(c => c.IsPinned).Descending(c => c.UpdatedAt), new CreateIndexOptions { Name = "ix_clips_user_pinned_updated" }),
            new CreateIndexModel<Clip>(Builders<Clip>.IndexKeys.Ascending(c => c.ShareToken), new CreateIndexOptions { Unique = true, Sparse = true, Name = "ux_clips_share_token" }),
            new CreateIndexModel<Clip>(Builders<Clip>.IndexKeys.Ascending(c => c.ExpiresAt), new CreateIndexOptions { Name = "ix_clips_expires_at" }),
            new CreateIndexModel<Clip>(Builders<Clip>.IndexKeys.Ascending(c => c.UserId).Ascending(c => c.Tags), new CreateIndexOptions { Name = "ix_clips_user_tags" }),
        });

        // audit_log
        var audit = db.GetCollection<AuditLog>("audit_log");
        audit.Indexes.CreateMany(new[]
        {
            new CreateIndexModel<AuditLog>(Builders<AuditLog>.IndexKeys.Ascending(a => a.Id), new CreateIndexOptions { Unique = true, Sparse = true, Name = "ux_audit_id" }),
            new CreateIndexModel<AuditLog>(Builders<AuditLog>.IndexKeys.Ascending(a => a.UserId).Ascending(a => a.CreatedAt), new CreateIndexOptions { Name = "ix_audit_user_created" }),
        });

        _logger.LogInformation("MongoDB indexes ensured.");
    }

    public IMongoCollection<T> GetCollection<T>(string name) where T : class => GetDatabase().GetCollection<T>(name);

    public IMongoCollection<User> Users => GetDatabase().GetCollection<User>("users");
    public IMongoCollection<Clip> Clips => GetDatabase().GetCollection<Clip>("clips");
    public IMongoCollection<AuditLog> AuditLog => GetDatabase().GetCollection<AuditLog>("audit_log");

    public void Dispose()
    {
        _client = null;
        _database = null;
        GC.SuppressFinalize(this);
    }
}
