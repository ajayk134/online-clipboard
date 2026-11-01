using MongoDB.Bson.Serialization.Attributes;

namespace OnlineClipboard.Models;

public class UserDto
{
    public long Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class ClipDto
{
    public long Id { get; set; }
    public long UserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string Excerpt { get; set; } = string.Empty;
    public ContentType ContentType { get; set; } = ContentType.Text;
    public string? Language { get; set; }
    public List<string> Tags { get; set; } = new();
    public bool IsPinned { get; set; }
    public bool IsFavorite { get; set; }
    public int CopyCount { get; set; }
    public int ViewCount { get; set; }
    public string? ShareToken { get; set; }
    public string? ShareUrl { get; set; }
    public bool ShareEnabled { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public bool IsOneTime { get; set; }
    public int ReadCount { get; set; }
    public bool HasPassword { get; set; }
    public string? PasswordHash { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class CreateClipRequest
{
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string ContentType { get; set; } = "text";
    public string? Language { get; set; }
    public List<string> Tags { get; set; } = new();
    public bool IsPinned { get; set; }
    public bool IsFavorite { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public bool Share { get; set; }
    public string? SharePassword { get; set; }
    public bool ShareOneTime { get; set; }
}
