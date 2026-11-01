using MongoDB.Driver;
using OnlineClipboard.Models;

namespace OnlineClipboard.Services;

public interface IMongoDbService : IAsyncDisposable
{
    void Connect();
    Task ConnectAsync(CancellationToken cancellationToken = default);
    IMongoDatabase GetDatabase();
    void Close();
    bool Ping();
    Task<bool> PingAsync(CancellationToken cancellationToken = default);
    long NextId(string collectionName);
    void EnsureIndexes();
    Task EnsureIndexesAsync(CancellationToken cancellationToken = default);
    IMongoCollection<T> GetCollection<T>(string name) where T : class;
    IMongoCollection<User> Users { get; }
    IMongoCollection<Clip> Clips { get; }
    IMongoCollection<AuditLog> AuditLog { get; }
}
