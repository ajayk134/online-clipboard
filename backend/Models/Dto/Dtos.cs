namespace OnlineClipboard.Models.Dto;

public class RegisterRequest
{
    public string Username { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LoginRequest
{
    public string Identifier { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class AuthResponse
{
    public string Token { get; set; } = string.Empty;
    public UserDto User { get; set; } = new();
}

public class ClipUpdateRequest
{
    public string? Title { get; set; }
    public string? Content { get; set; }
    public string? ContentType { get; set; }
    public string? Language { get; set; }
    public List<string>? Tags { get; set; }
    public bool? IsPinned { get; set; }
    public bool? IsFavorite { get; set; }
    public DateTime? ExpiresAt { get; set; }
}

public class ShareMetaResponse
{
    public string Title { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public string? Language { get; set; }
    public bool HasPassword { get; set; }
    public bool IsOneTime { get; set; }
    public bool Available { get; set; }
    public bool Expired { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public string Excerpt { get; set; } = string.Empty;
}

public class ShareAccessResponse
{
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public string? Language { get; set; }
    public bool Consumed { get; set; }
    public DateTime? ExpiresAt { get; set; }
}

public class StatsResponse
{
    public int Total { get; set; }
    public int Favorites { get; set; }
    public int Pinned { get; set; }
    public int Copies { get; set; }
    public int Views { get; set; }
    public int Shared { get; set; }
}

public class TagCount
{
    public string Tag { get; set; } = string.Empty;
    public int Count { get; set; }
}

public class ErrorResponse
{
    public string Error { get; set; } = string.Empty;
    public int Status { get; set; }
}
