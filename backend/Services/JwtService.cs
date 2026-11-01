using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
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
    private readonly TimeSpan _expiry = TimeSpan.FromDays(7);

    public JwtService(IConfiguration configuration)
    {
        _secret = configuration["JWT_SECRET"]
                  ?? Environment.GetEnvironmentVariable("JWT_SECRET")
                  ?? throw new InvalidOperationException("JWT_SECRET is not configured");
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
            audience: _issuer,
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
                ValidAudience = _issuer,
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
