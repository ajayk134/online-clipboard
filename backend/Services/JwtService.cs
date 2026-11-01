using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using OnlineClipboard.Models;

namespace OnlineClipboard.Services;

public interface IJwtService
{
    string GenerateToken(User user);
    bool ValidateToken(string token, out ClaimsPrincipal? principal);
    long? GetUserId(string token);
}

public class JwtService : IJwtService
{
    private readonly string _secret;
    private readonly string _issuer = "online-clipboard";
    private readonly string _audience = "online-clipboard";
    private readonly TimeSpan _expiry;

    public JwtService(IConfiguration configuration)
    {
        _secret = Environment.GetEnvironmentVariable("JWT_SECRET")
                  ?? configuration["Jwt:Secret"]
                  ?? throw new InvalidOperationException("JWT_SECRET is not configured");

        if (string.IsNullOrWhiteSpace(_secret) || _secret == "dev-secret-change-me")
        {
            throw new InvalidOperationException("JWT_SECRET is not configured. Set a strong random value.");
        }

        var expiryDays = Environment.GetEnvironmentVariable("JWT_EXPIRY_DAYS")
                         ?? configuration["Jwt:ExpiryDays"];
        _expiry = !string.IsNullOrWhiteSpace(expiryDays) && double.TryParse(expiryDays, out var days) && days > 0
            ? TimeSpan.FromDays(days)
            : TimeSpan.FromDays(7);
    }

    public string GenerateToken(User user)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim("ver", user.TokenVersion.ToString()),
            new Claim("username", user.Username),
            new Claim("email", user.Email),
        };

        var token = new JwtSecurityToken(
            issuer: _issuer,
            audience: _audience,
            claims: claims,
            expires: DateTime.UtcNow.Add(_expiry),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public bool ValidateToken(string token, out ClaimsPrincipal? principal)
    {
        principal = null;
        if (string.IsNullOrWhiteSpace(token))
            return false;

        var handler = new JwtSecurityTokenHandler();
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secret));

        try
        {
            principal = handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = _issuer,
                ValidateAudience = true,
                ValidAudience = _audience,
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

    public long? GetUserId(string token)
    {
        if (!ValidateToken(token, out var principal))
            return null;
        var sub = principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                  ?? principal?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        return long.TryParse(sub, out var id) ? id : null;
    }
}
