using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using MongoDB.Driver;
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
                            context.Items["UserId"] = userId;
                            context.Items["Token"] = token;
                            context.Items["TokenVersion"] = tokenVersion;
                            context.Items["User"] = user;
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
        return context.Items["UserId"] as long?;
    }

    public static int? GetTokenVersion(this HttpContext context)
    {
        return context.Items["TokenVersion"] as int?;
    }

    public static string? GetToken(this HttpContext context)
    {
        return context.Items["Token"] as string;
    }
}
