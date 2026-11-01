using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace OnlineClipboard.Models;

public enum ContentType
{
    Text,
    Richtext,
    Code
}

public class Clip
{
    [BsonId]
    [BsonElement("id")]
    public long Id { get; set; }

    [BsonElement("user_id")]
    public long UserId { get; set; }

    [BsonElement("title")]
    public string Title { get; set; } = string.Empty;

    [BsonElement("title_lower")]
    public string TitleLower { get; set; } = string.Empty;

    [BsonElement("content")]
    public string Content { get; set; } = string.Empty;

    [BsonElement("excerpt")]
    public string Excerpt { get; set; } = string.Empty;

    [BsonElement("content_type")]
    public ContentType ContentType { get; set; } = ContentType.Text;

    [BsonElement("language")]
    public string? Language { get; set; }

    [BsonElement("tags")]
    public List<string> Tags { get; set; } = new();

    [BsonElement("is_pinned")]
    public bool IsPinned { get; set; }

    [BsonElement("is_favorite")]
    public bool IsFavorite { get; set; }

    [BsonElement("copy_count")]
    public int CopyCount { get; set; }

    [BsonElement("view_count")]
    public int ViewCount { get; set; }

    [BsonElement("share_token")]
    public string? ShareToken { get; set; }

    [BsonElement("share_enabled")]
    public bool ShareEnabled { get; set; }

    [BsonElement("expires_at")]
    public DateTime? ExpiresAt { get; set; }

    [BsonElement("is_one_time")]
    public bool IsOneTime { get; set; }

    [BsonElement("read_count")]
    public int ReadCount { get; set; }

    [BsonElement("password_hash")]
    public string? PasswordHash { get; set; }

    [BsonElement("created_at")]
    public DateTime CreatedAt { get; set; }

    [BsonElement("updated_at")]
    public DateTime UpdatedAt { get; set; }
}
