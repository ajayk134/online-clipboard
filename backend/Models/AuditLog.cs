using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace OnlineClipboard.Models;

public class AuditLog
{
    [BsonId]
    [BsonElement("id")]
    public long Id { get; set; }

    [BsonElement("user_id")]
    public long? UserId { get; set; }

    [BsonElement("action")]
    public string Action { get; set; } = string.Empty;

    [BsonElement("detail")]
    public string? Detail { get; set; }

    [BsonElement("ip")]
    public string? Ip { get; set; }

    [BsonElement("created_at")]
    public DateTime CreatedAt { get; set; }
}
