using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using BCrypt.Net;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace OnlineClipboard.Tests;

public static class TestAuth
{
    public const string TestSecret = "test-only-secret-do-not-use-in-production-0123456789abcdef";
    public const string Issuer = "online-clipboard";
    public const string Audience = "online-clipboard";
    public static readonly TimeSpan Expiry = TimeSpan.FromDays(7);

    public static string GenerateToken(long userId, int tokenVersion, string username, string email,
        string? secret = null)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret ?? TestSecret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim("ver", tokenVersion.ToString()),
            new Claim("username", username),
            new Claim("email", email),
        };
        var token = new JwtSecurityToken(
            issuer: Issuer,
            audience: Audience,
            claims: claims,
            expires: DateTime.UtcNow.Add(Expiry),
            signingCredentials: credentials);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public static bool ValidateToken(string token, out ClaimsPrincipal? principal, string? secret = null)
    {
        principal = null;
        if (string.IsNullOrWhiteSpace(token)) return false;
        var handler = new JwtSecurityTokenHandler();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret ?? TestSecret));
        try
        {
            principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = Issuer,
                ValidateAudience = true,
                ValidAudience = Audience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = key,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero,
            }, out _);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static long? GetUserId(string token, string? secret = null)
    {
        if (!ValidateToken(token, out var principal, secret)) return null;
        var sub = principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                  ?? principal?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        return long.TryParse(sub, out var id) ? id : null;
    }

    public static string HashPassword(string password, int rounds = 12) => BCrypt.Net.BCrypt.HashPassword(password, rounds);
    public static bool VerifyPassword(string password, string hash) =>
        !string.IsNullOrEmpty(hash) && BCrypt.Net.BCrypt.Verify(password, hash);
}
