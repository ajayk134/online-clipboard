using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MongoDB.Driver;
using OnlineClipboard.Models;
using OnlineClipboard.Services;
using OnlineClipboard.Models.Dto;
using OnlineClipboard.Middleware;

namespace OnlineClipboard.Controllers;

[ApiController]
[Route("api/auth")]
[EnableRateLimiting("auth")]
public class AuthController : ControllerBase
{
    private readonly IMongoDbService _db;
    private readonly IJwtService _jwt;
    private readonly IPasswordService _password;

    public AuthController(IMongoDbService db, IJwtService jwt, IPasswordService password)
    {
        _db = db;
        _jwt = jwt;
        _password = password;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(req.Username) || req.Username.Length < 3 || req.Username.Length > 32)
            errors.Add("Username must be 3-32 characters");
        if (string.IsNullOrWhiteSpace(req.Email) || !IsValidEmail(req.Email))
            errors.Add("Valid email is required");
        if (string.IsNullOrWhiteSpace(req.Password) || req.Password.Length < 8 || req.Password.Length > 128
            || !req.Password.Any(char.IsLetter) || !req.Password.Any(char.IsDigit))
            errors.Add("Password must be 8-128 characters with a letter and a number");

        if (errors.Count > 0)
            return BadRequest(new { error = "validation_error", errors });

        var usernameLower = req.Username.Trim().ToLowerInvariant();
        var emailLower = req.Email.Trim().ToLowerInvariant();

        if (await _db.Users.Find(u => u.UsernameLower == usernameLower).AnyAsync())
            errors.Add("Username already taken");
        if (await _db.Users.Find(u => u.EmailLower == emailLower).AnyAsync())
            errors.Add("Email already registered");

        if (errors.Count > 0)
            return Conflict(new { error = "conflict", errors });

        var user = new User
        {
            Id = _db.NextId("users"),
            Username = req.Username.Trim(),
            UsernameLower = usernameLower,
            Email = req.Email.Trim(),
            EmailLower = emailLower,
            PasswordHash = _password.Hash(req.Password, 12),
            TokenVersion = 0,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        await _db.Users.InsertOneAsync(user);

        var token = _jwt.GenerateToken(user);
        return Created(string.Empty, new AuthResponse { Token = token, User = new UserDto
        {
            Id = user.Id, Username = user.Username, Email = user.Email, CreatedAt = user.CreatedAt
        }});
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Identifier) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { error = "validation_error", errors = new[] { "Identifier and password are required" } });

        var identifierLower = req.Identifier.Trim().ToLowerInvariant();
        var user = await _db.Users.Find(u =>
            u.UsernameLower == identifierLower || u.EmailLower == identifierLower).FirstOrDefaultAsync();

        if (user == null || !_password.Verify(req.Password, user.PasswordHash))
            return Unauthorized(new { error = "invalid_credentials", message = "Invalid username or password" });

        // Increment TokenVersion on login so all previously issued tokens are invalidated
        // (session fixation protection).
        var update = Builders<User>.Update
            .Inc(u => u.TokenVersion, 1)
            .Set(u => u.UpdatedAt, DateTime.UtcNow);
        await _db.Users.UpdateOneAsync(u => u.Id == user.Id, update);
        user = await _db.Users.Find(u => u.Id == user.Id).FirstOrDefaultAsync()!;

        var token = _jwt.GenerateToken(user);
        return Ok(new AuthResponse { Token = token, User = new UserDto
        {
            Id = user.Id, Username = user.Username, Email = user.Email, CreatedAt = user.CreatedAt
        }});
    }

    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me()
    {
        var userId = HttpContext.GetUserIdLong();
        if (!userId.HasValue)
            return Unauthorized(new { error = "unauthorized", message = "Authentication required" });

        var user = await _db.Users.Find(u => u.Id == userId.Value).FirstOrDefaultAsync();
        if (user == null)
            return Unauthorized(new { error = "unauthorized", message = "User not found" });

        return Ok(new { User = new UserDto
        {
            Id = user.Id, Username = user.Username, Email = user.Email, CreatedAt = user.CreatedAt
        }});
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var userId = HttpContext.GetUserIdLong();
        if (!userId.HasValue)
            return Unauthorized(new { error = "unauthorized", message = "Authentication required" });

        var user = await _db.Users.Find(u => u.Id == userId.Value).FirstOrDefaultAsync();
        if (user == null)
            return Unauthorized(new { error = "unauthorized", message = "User not found" });

        var update = Builders<User>.Update
            .Inc(u => u.TokenVersion, 1)
            .Set(u => u.UpdatedAt, DateTime.UtcNow);
        await _db.Users.UpdateOneAsync(u => u.Id == userId.Value, update);

        return Ok(new { message = "Logged out successfully" });
    }

    [HttpPut("password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] PasswordRequest req)
    {
        var userId = HttpContext.GetUserIdLong();
        if (!userId.HasValue)
            return Unauthorized(new { error = "unauthorized", message = "Authentication required" });

        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(req.CurrentPassword))
            errors.Add("Current password is required");
        if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 8 || req.NewPassword.Length > 128
            || !req.NewPassword.Any(char.IsLetter) || !req.NewPassword.Any(char.IsDigit))
            errors.Add("New password must be 8-128 characters with a letter and a number");

        if (errors.Count > 0)
            return BadRequest(new { error = "validation_error", errors });

        var user = await _db.Users.Find(u => u.Id == userId.Value).FirstOrDefaultAsync();
        if (user == null)
            return Unauthorized(new { error = "unauthorized", message = "User not found" });

        if (!_password.Verify(req.CurrentPassword, user.PasswordHash))
            return BadRequest(new { error = "invalid_current_password", message = "Current password is incorrect" });

        var update = Builders<User>.Update
            .Set(u => u.PasswordHash, _password.Hash(req.NewPassword, 12))
            .Inc(u => u.TokenVersion, 1)
            .Set(u => u.UpdatedAt, DateTime.UtcNow);
        await _db.Users.UpdateOneAsync(u => u.Id == userId.Value, update);

        var updated = await _db.Users.Find(u => u.Id == userId.Value).FirstOrDefaultAsync();
        var token = _jwt.GenerateToken(updated!);
        return Ok(new { token, message = "Password changed successfully" });
    }

    public class PasswordRequest
    {
        public string CurrentPassword { get; set; } = string.Empty;
        public string NewPassword { get; set; } = string.Empty;
    }

    private static bool IsValidEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        try
        {
            var addr = new System.Net.Mail.MailAddress(email.Trim());
            return addr.Address == email.Trim();
        }
        catch
        {
            return false;
        }
    }
}
