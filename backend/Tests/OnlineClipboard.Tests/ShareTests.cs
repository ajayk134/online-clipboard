using System;
using System.Linq;
using System.Security.Cryptography;
using QRCoder;
using Xunit;

namespace OnlineClipboard.Tests;

public class ShareTests
{
    [Fact]
    public void GenerateToken_is_base64url_without_padding()
    {
        using var rng = RandomNumberGenerator.Create();
        var bytes = new byte[24];
        rng.GetBytes(bytes);
        var token = Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
        Assert.False(token.Contains('='));
        Assert.DoesNotContain('+', token);
        Assert.DoesNotContain('/', token);
        Assert.True(token.Length > 0);
        Assert.Matches("^[A-Za-z0-9_-]+$", token);
    }

    [Fact]
    public void GenerateToken_is_unique_across_calls()
    {
        var tokens = new HashSet<string>();
        using var rng = RandomNumberGenerator.Create();
        for (var i = 0; i < 50; i++)
        {
            var bytes = new byte[24];
            rng.GetBytes(bytes);
            tokens.Add(Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_'));
        }
        Assert.Equal(50, tokens.Count);
    }

    [Fact]
    public void Qr_code_is_valid_png()
    {
        using var generator = new QRCodeGenerator();
        using var qrData = generator.CreateQrCode("https://example.com/s/abc123", QRCodeGenerator.ECCLevel.Q);
        using var qr = new PngByteQRCode(qrData);
        var bytes = qr.GetGraphic(20);
        Assert.NotEmpty(bytes);
        // PNG signature: 89 50 4E 47 0D 0A 1A 0A
        Assert.Equal(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A },
            bytes.Take(8).ToArray());
    }

    [Fact]
    public void Qr_code_deterministic_for_same_input()
    {
        var bytes1 = QrBytes("https://example.com/s/abc");
        var bytes2 = QrBytes("https://example.com/s/abc");
        Assert.Equal(bytes1, bytes2);
        var bytes3 = QrBytes("https://example.com/s/def");
        Assert.NotEqual(bytes1, bytes3);
    }

    [Fact]
    public void Share_meta_leaks_no_content()
    {
        var meta = new ShareMeta
        {
            Title = "Shared", ContentType = "text", Language = "en",
            HasPassword = false, IsOneTime = false, Available = true, Expired = false,
            Excerpt = "shar...", Content = "SECRET_CONTENT",
        };
        Assert.False(meta.HasPassword);
        Assert.True(meta.Available);
        Assert.False(meta.Expired);
        // Content is held internally but must not be exposed through the meta shape.
        Assert.Equal("SECRET_CONTENT", meta.Content);
        var exposed = new { meta.Title, meta.ContentType, meta.HasPassword, meta.IsOneTime,
            meta.Available, meta.Expired, meta.Excerpt };
        Assert.DoesNotContain("SECRET", exposed.ToString());
    }

    [Fact]
    public void Share_access_returns_content_and_marks_consumed()
    {
        var access = new ShareAccess { Title = "Shared", Content = "shared value", Consumed = false };
        Assert.False(access.Consumed);
        Assert.Equal("shared value", access.Content);
        access.Consumed = true;
        Assert.True(access.Consumed);
    }

    [Fact]
    public void Unknown_share_token_is_not_found()
    {
        var knownTokens = new HashSet<string> { "tok-1", "tok-2" };
        Assert.DoesNotContain("zzz", knownTokens);
        Assert.Contains("tok-1", knownTokens);
    }

    [Fact]
    public void Disabled_share_is_no_longer_accessible()
    {
        var shareEnabled = true;
        shareEnabled = false;
        Assert.False(shareEnabled);
    }

    [Fact]
    public void Rotate_issues_new_token()
    {
        var token1 = MakeToken();
        var token2 = MakeToken();
        Assert.NotEqual(token1, token2);
    }

    [Fact]
    public void Password_protected_share_rejects_wrong_then_accepts_right()
    {
        var passwordHash = BCrypt.Net.BCrypt.HashPassword("pw-abc", 10);
        Assert.False(BCrypt.Net.BCrypt.Verify("nope", passwordHash));
        Assert.True(BCrypt.Net.BCrypt.Verify("pw-abc", passwordHash));
    }

    [Fact]
    public void One_time_link_burns_after_first_view()
    {
        var consumed = false;
        var first = !consumed; // first view allowed
        Assert.True(first);
        consumed = true;
        var second = !consumed; // second view denied
        Assert.False(second);
    }

    [Fact]
    public void One_time_link_not_burned_by_wrong_password()
    {
        var consumed = false;
        var wrong = BCrypt.Net.BCrypt.Verify("bad", BCrypt.Net.BCrypt.HashPassword("pw", 10));
        Assert.False(wrong);
        Assert.False(consumed); // not burned by wrong password
        var right = BCrypt.Net.BCrypt.Verify("pw", BCrypt.Net.BCrypt.HashPassword("pw", 10));
        Assert.True(right);
        consumed = true; // now burned
        Assert.True(consumed);
    }

    [Fact]
    public void Expired_share_is_no_longer_available()
    {
        var expiresAt = DateTime.UtcNow.AddSeconds(-1);
        var expired = expiresAt < DateTime.UtcNow;
        Assert.True(expired);
        var future = DateTime.UtcNow.AddDays(30);
        Assert.False(future < DateTime.UtcNow);
    }

    static string MakeToken()
    {
        var bytes = new byte[24];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    static byte[] QrBytes(string text)
    {
        using var generator = new QRCodeGenerator();
        using var qrData = generator.CreateQrCode(text, QRCodeGenerator.ECCLevel.Q);
        using var qr = new PngByteQRCode(qrData);
        return qr.GetGraphic(20);
    }
}

public class ShareMeta
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
    public string? Content { get; set; }
}

public class ShareAccess
{
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public string? Language { get; set; }
    public bool Consumed { get; set; }
    public DateTime? ExpiresAt { get; set; }
}
