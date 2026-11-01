using MongoDB.Driver;
using OnlineClipboard.Models;

namespace OnlineClipboard.Services;

public interface IMongoDbService
{
    void Connect();
    IMongoDatabase GetDatabase();
    void Close();
    bool Ping();
    long NextId(string collectionName);
    void EnsureIndexes();
    IMongoCollection<T> GetCollection<T>(string name) where T : class;
    IMongoCollection<User> Users { get; }
    IMongoCollection<Clip> Clips { get; }
    IMongoCollection<AuditLog> AuditLog { get; }
}
