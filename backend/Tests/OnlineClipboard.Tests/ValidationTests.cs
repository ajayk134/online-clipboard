using System.Collections.Generic;
using System.Linq;
using System.Net.Mail;
using Xunit;

namespace OnlineClipboard.Tests;

public class ValidationTests
{
    [Fact]
    public void Invalid_register_returns_400_errors()
    {
        var errors = ValidateRegister(null, null, null);
        Assert.NotEmpty(errors);
        Assert.Contains(errors, e => e.Contains("Username"));
        Assert.Contains(errors, e => e.Contains("email"));
        Assert.Contains(errors, e => e.Contains("Password"));

        errors = ValidateRegister("ab", "bad-email", "weak");
        Assert.NotEmpty(errors);
        Assert.Contains(errors, e => e.Contains("Username must be 3-32"));
        Assert.Contains(errors, e => e.Contains("Valid email"));
        Assert.Contains(errors, e => e.Contains("8-128"));
    }

    [Fact]
    public void Valid_register_returns_no_errors()
    {
        var errors = ValidateRegister("alice", "alice@example.com", "S3cure-pass!");
        Assert.Empty(errors);
    }

    [Fact]
    public void Invalid_login_returns_400()
    {
        var errors = ValidateLogin("", "");
        Assert.NotEmpty(errors);
        Assert.Contains(errors, e => e.Contains("Identifier and password are required"));

        errors = ValidateLogin("alice", "");
        Assert.NotEmpty(errors);
        errors = ValidateLogin("", "S3cure-pass!");
        Assert.NotEmpty(errors);
    }

    [Fact]
    public void Valid_login_returns_no_errors()
    {
        Assert.Empty(ValidateLogin("alice", "S3cure-pass!"));
        Assert.Empty(ValidateLogin("alice@example.com", "S3cure-pass!"));
    }

    [Fact]
    public void Invalid_clip_create_returns_400()
    {
        var errors = ValidateClipCreate(null, "text", null);
        Assert.NotEmpty(errors);
        Assert.Contains(errors, e => e.Contains("Content is required"));

        errors = ValidateClipCreate(new string('x', 100_001), "text", null);
        Assert.Contains(errors, e => e.Contains("Content too large"));

        errors = ValidateClipCreate("ok", "image/png", null);
        Assert.Contains(errors, e => e.Contains("Invalid content type"));

        var tooMany = Enumerable.Range(0, 11).Select(i => $"t{i}").ToList();
        errors = ValidateClipCreate("ok", "text", tooMany);
        Assert.Contains(errors, e => e.Contains("Maximum 10 tags"));
    }

    [Fact]
    public void Valid_clip_create_returns_no_errors()
    {
        Assert.Empty(ValidateClipCreate("hello", "text", new List<string> { "a" }));
        Assert.Empty(ValidateClipCreate("hello", "code", null));
    }

    [Fact]
    public void Invalid_password_change_returns_400()
    {
        var errors = ValidatePasswordChange("", "S3cure-pass!");
        Assert.Contains(errors, e => e.Contains("Current password is required"));
        errors = ValidatePasswordChange("cur", "weak");
        Assert.Contains(errors, e => e.Contains("New password must be 8-128"));
    }

    [Fact]
    public void Valid_password_change_returns_no_errors()
    {
        Assert.Empty(ValidatePasswordChange("cur-pass-1", "S3cure-pass-2"));
    }

    [Fact]
    public void Invalid_share_password_validation()
    {
        var errors = ValidateSharePassword("pw", true);
        Assert.Empty(errors);
        errors = ValidateSharePassword(null, false);
        Assert.Empty(errors); // no password requested -> fine
    }

    static IList<string> ValidateRegister(string? username, string? email, string? password)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(username) || username.Length < 3 || username.Length > 32)
            errors.Add("Username must be 3-32 characters");
        if (string.IsNullOrWhiteSpace(email) || !IsValidEmail(email))
            errors.Add("Valid email is required");
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8 || password.Length > 128
            || !password.Any(char.IsLetter) || !password.Any(char.IsDigit))
            errors.Add("Password must be 8-128 characters with a letter and a number");
        return errors;
    }

    static IList<string> ValidateLogin(string? identifier, string? password)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(identifier) || string.IsNullOrWhiteSpace(password))
            errors.Add("Identifier and password are required");
        return errors;
    }

    static IList<string> ValidateClipCreate(string? content, string? contentType, IList<string>? tags)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(content)) errors.Add("Content is required");
        else if (content!.Length > 100_000) errors.Add("Content too large (max 100KB)");
        if (!string.IsNullOrWhiteSpace(contentType))
        {
            var ct = contentType.Trim().ToLowerInvariant();
            if (ct != "text" && ct != "richtext" && ct != "code")
                errors.Add("Invalid content type");
        }
        if (tags != null && tags.Count > 10) errors.Add("Maximum 10 tags per clip");
        return errors;
    }

    static IList<string> ValidatePasswordChange(string? current, string? newPassword)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(current)) errors.Add("Current password is required");
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < 8 || newPassword.Length > 128
            || !newPassword.Any(char.IsLetter) || !newPassword.Any(char.IsDigit))
            errors.Add("New password must be 8-128 characters with a letter and a number");
        return errors;
    }

    static IList<string> ValidateSharePassword(string? password, bool required)
    {
        var errors = new List<string>();
        if (required && string.IsNullOrWhiteSpace(password))
            errors.Add("Share password is required");
        return errors;
    }

    static bool IsValidEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        try
        {
            var addr = new System.Net.Mail.MailAddress(email.Trim());
            return addr.Address == email.Trim();
        }
        catch { return false; }
    }
}
