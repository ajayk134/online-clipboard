using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Configuration;
using MongoDB.Driver;
using OnlineClipboard.Models;
using OnlineClipboard.Services;

namespace OnlineClipboard.Controllers;

[ApiController]
[Route("api/share")]
[EnableRateLimiting("share")]
public class ShareController : ControllerBase
{
    private readonly IMongoDbService _db;
    private readonly IPasswordService _password;
    private readonly IShareService _share;
    private readonly string? _publicBaseUrl;

    public ShareController(IMongoDbService db, IPasswordService password, IShareService share,
        IConfiguration configuration)
    {
        _db = db;
        _password = password;
        _share = share;
        _publicBaseUrl = Environment.GetEnvironmentVariable("PUBLIC_BASE_URL")
            ?? configuration["PublicBaseUrl"];
    }

    public record AccessRequest(string? Password);

    private string ShareUrl(string token) =>
        $"{(_publicBaseUrl ?? string.Empty).TrimEnd('/')}/api/share/{token}";

    [HttpGet("{token}/meta")]
    public async Task<IActionResult> Meta(string token)
    {
        var clip = await _db.Clips.Find(c =>
            c.ShareToken == token && c.ShareEnabled).FirstOrDefaultAsync();
        if (clip == null)
            return NotFound(new { error = "not_found", message = "Share not found" });

        var expired = clip.ExpiresAt.HasValue && clip.ExpiresAt.Value <= DateTime.UtcNow;
        var consumed = clip.IsOneTime && clip.ReadCount > 0;
        var available = clip.ShareEnabled && !expired && !consumed;

        return Ok(new
        {
            title = clip.Title,
            contentType = clip.ContentType.ToString().ToLowerInvariant(),
            language = clip.Language,
            hasPassword = !string.IsNullOrEmpty(clip.PasswordHash),
            isOneTime = clip.IsOneTime,
            available,
            expired,
            expiresAt = clip.ExpiresAt,
            createdAt = clip.CreatedAt,
            excerpt = clip.Excerpt,
            shareUrl = available ? ShareUrl(token) : null,
        });
    }

    [HttpPost("{token}/access")]
    public async Task<IActionResult> Access(string token, [FromBody] AccessRequest? req)
    {
        var clip = await _db.Clips.Find(c =>
            c.ShareToken == token && c.ShareEnabled).FirstOrDefaultAsync();
        if (clip == null)
            return NotFound(new { error = "not_found", message = "Share not found" });

        var expired = clip.ExpiresAt.HasValue && clip.ExpiresAt.Value <= DateTime.UtcNow;
        if (expired)
            return Gone(new { error = "expired", message = "This share has expired" });

        if (clip.IsOneTime && clip.ReadCount > 0)
            return Gone(new { error = "consumed", message = "This one-time share has already been accessed" });

        if (!string.IsNullOrEmpty(clip.PasswordHash))
        {
            var password = req?.Password ?? string.Empty;
            if (!_password.Verify(password, clip.PasswordHash))
                return Unauthorized(new { error = "invalid_password", message = "Invalid password" });
        }

        if (clip.IsOneTime)
        {
            var burnResult = await _db.Clips.UpdateOneAsync(
                c => c.ShareToken == token && c.ShareEnabled && c.IsOneTime && c.ReadCount == 0,
                Builders<Clip>.Update
                    .Inc(c => c.ReadCount, 1)
                    .Inc(c => c.ViewCount, 1)
                    .Set(c => c.UpdatedAt, DateTime.UtcNow));

            if (burnResult.ModifiedCount == 0)
                return Gone(new { error = "consumed", message = "This one-time share has already been accessed" });

            var updated = await _db.Clips.Find(c => c.ShareToken == token).FirstOrDefaultAsync();

            return Ok(new
            {
                title = updated!.Title,
                content = updated.Content,
                contentType = updated.ContentType.ToString().ToLowerInvariant(),
                language = updated.Language,
                consumed = true,
                expiresAt = updated.ExpiresAt,
                shareUrl = ShareUrl(token),
            });
        }

        var viewResult = await _db.Clips.UpdateOneAsync(
            c => c.ShareToken == token && c.ShareEnabled && !c.IsOneTime,
            Builders<Clip>.Update
                .Inc(c => c.ReadCount, 1)
                .Inc(c => c.ViewCount, 1)
                .Set(c => c.UpdatedAt, DateTime.UtcNow));

        var fetched = await _db.Clips.Find(c => c.ShareToken == token).FirstOrDefaultAsync();

        return Ok(new
        {
            title = fetched!.Title,
            content = fetched.Content,
            contentType = fetched.ContentType.ToString().ToLowerInvariant(),
            language = fetched.Language,
            consumed = false,
            expiresAt = fetched.ExpiresAt,
            shareUrl = ShareUrl(token),
        });
    }

    private IActionResult Gone(object value)
    {
        return StatusCode(StatusCodes.Status410Gone, value);
    }
}
