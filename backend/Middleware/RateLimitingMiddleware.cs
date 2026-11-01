using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Caching.Memory;

namespace OnlineClipboard.Middleware;

public class RateLimitCounter
{
    public int Count;
    public DateTime WindowStart;
}

public class RateLimitingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IMemoryCache _cache;

    private sealed class Limit
    {
        public int Value;
        public int Minutes;
    }

    private static readonly Limit[] Limits =
    {
        new() { Value = 600, Minutes = 15 }, // global
        new() { Value = 30, Minutes = 15 },  // auth
        new() { Value = 240, Minutes = 15 }, // write
        new() { Value = 40, Minutes = 15 },  // share
    };

    public RateLimitingMiddleware(RequestDelegate next, IMemoryCache cache)
    {
        _next = next;
        _cache = cache;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;
        var method = context.Request.Method;

        Limit category = Limits[0];
        string keyPrefix = "rl:global";

        if (path.StartsWith("/api/auth", StringComparison.OrdinalIgnoreCase))
        {
            category = Limits[1];
            keyPrefix = "rl:auth";
        }
        else if (path.StartsWith("/api/share", StringComparison.OrdinalIgnoreCase))
        {
            category = Limits[3];
            keyPrefix = "rl:share";
        }
        else if (method is "POST" or "PUT" or "PATCH" or "DELETE")
        {
            category = Limits[2];
            keyPrefix = "rl:write";
        }

        var identifier = context.Request.Headers.TryGetValue("X-Forwarded-For", out var fwd)
            ? fwd.First()
            : context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var cacheKey = $"{keyPrefix}:{identifier}";

        if (!_cache.TryGetValue(cacheKey, out RateLimitCounter? counter) || counter is null)
        {
            counter = new RateLimitCounter { Count = 0, WindowStart = DateTime.UtcNow };
        }

        var now = DateTime.UtcNow;
        if ((now - counter!.WindowStart).TotalMinutes > category.Minutes)
        {
            counter = new RateLimitCounter { Count = 0, WindowStart = now };
        }

        counter.Count++;

        _cache.Set(cacheKey, counter, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(category.Minutes)
        });

        var remaining = Math.Max(0, category.Value - counter.Count);
        var reset = DateTimeOffset.UtcNow.AddMinutes(category.Minutes);

        context.Response.Headers["X-RateLimit-Limit"] = category.Value.ToString();
        context.Response.Headers["X-RateLimit-Remaining"] = remaining.ToString();
        context.Response.Headers["X-RateLimit-Reset"] = reset.ToUnixTimeSeconds().ToString();

        if (counter.Count > category.Value)
        {
            context.Response.ContentType = "application/json";
            context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            await context.Response.WriteAsync("{\"error\":\"rate_limited\",\"message\":\"Too many requests. Please try again later.\"}");
            return;
        }

        await _next(context);
    }
}

public static class RateLimitingMiddlewareExtensions
{
    public static IApplicationBuilder UseRateLimiting(this IApplicationBuilder builder)
    {
        return builder.UseMiddleware<RateLimitingMiddleware>();
    }
}
