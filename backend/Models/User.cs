using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace OnlineClipboard.Models;

public class User
{
    [BsonId]
    [BsonElement("id")]
    public long Id { get; set; }

    [BsonElement("username")]
    public string Username { get; set; } = string.Empty;

    [BsonElement("email")]
    public string Email { get; set; } = string.Empty;

    [BsonElement("username_lower")]
    public string UsernameLower { get; set; } = string.Empty;

    [BsonElement("email_lower")]
    public string EmailLower { get; set; } = string.Empty;

    [BsonElement("password_hash")]
    public string PasswordHash { get; set; } = string.Empty;

    [BsonElement("token_version")]
    public int TokenVersion { get; set; }

    [BsonElement("created_at")]
    public DateTime CreatedAt { get; set; }

    [BsonElement("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
