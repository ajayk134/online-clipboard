using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using MongoDB.Driver;
using Microsoft.IdentityModel.Tokens;
using OnlineClipboard.Models;
using OnlineClipboard.Services;

namespace OnlineClipboard.Middleware;

public class AuthMiddleware
{
    private readonly RequestDelegate _next;
    private const string Scheme = "Bearer";

    public AuthMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, IJwtService jwtService, IMongoDbService db)
    {
        context.Items["UserId"] = null;
        context.Items["TokenVersion"] = null;
        context.Items["Token"] = null;
        context.Items["User"] = null;

        if (context.Request.Headers.TryGetValue("Authorization", out var authHeader))
        {
            var header = authHeader.ToString();
            if (header.StartsWith($"{Scheme} ", StringComparison.OrdinalIgnoreCase))
            {
                var token = header[Scheme.Length..].Trim();
                if (jwtService.ValidateToken(token, out var principal))
                {
                    var userIdStr = principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                                    ?? principal?.FindFirst("sub")?.Value;
                    if (long.TryParse(userIdStr, out var userId))
                    {
                        var user = await db.Users.Find(u => u.Id == userId).FirstOrDefaultAsync();
                        if (user != null)
                        {
                            var verClaim = principal?.FindFirst("ver")?.Value;
                            int? tokenVersion = int.TryParse(verClaim, out var v) ? v : null;

                            // Enforce TokenVersion: a token issued before the user's current
                            // TokenVersion (e.g. after logout or password change) is rejected.
                            if (tokenVersion.HasValue && tokenVersion.Value >= user.TokenVersion)
                            {
                                context.Items["UserId"] = userId;
                                context.Items["Token"] = token;
                                context.Items["TokenVersion"] = tokenVersion;
                                context.Items["User"] = user;

                                // Build a ClaimsPrincipal so built-in [Authorize] / policies work.
                                var claims = new List<Claim>
                                {
                                    new(ClaimTypes.NameIdentifier, userId.ToString()),
                                    new(ClaimTypes.Name, user.Username),
                                    new(ClaimTypes.Email, user.Email),
                                    new("ver", user.TokenVersion.ToString()),
                                };
                                var identity = new ClaimsIdentity(claims, "Bearer");
                                context.User = new ClaimsPrincipal(identity);
                            }
                        }
                    }
                }
            }
        }

        await _next(context);
    }
}

public static class AuthMiddlewareExtensions
{
    public static long? GetUserIdLong(this HttpContext context)
    {
        var value = context.Items["UserId"];
        return value as long?;
    }

    public static int? GetTokenVersion(this HttpContext context)
    {
        var value = context.Items["TokenVersion"];
        return value as int?;
    }

    public static string? GetToken(this HttpContext context)
    {
        var value = context.Items["Token"];
        return value as string;
    }
}
