using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Net.Mail;
using System.Security.Claims;
using Xunit;

namespace OnlineClipboard.Tests;

public class AuthTests
{
    [Fact]
    public void GenerateToken_contains_expected_claims_and_issuer()
    {
        var token = TestAuth.GenerateToken(42, 0, "alice", "alice@example.com");
        Assert.True(TestAuth.ValidateToken(token, out var principal));
        Assert.NotNull(principal);
        Assert.Equal(TestAuth.Issuer, principal?.FindFirst("iss")?.Value);
        Assert.Equal("42", principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value);
        Assert.Equal("0", principal?.FindFirst("ver")?.Value);
        Assert.Equal("alice", principal?.FindFirst("username")?.Value);
        Assert.Equal("alice@example.com", principal?.FindFirst(ClaimTypes.Email)?.Value);
    }

    [Fact]
    public void GenerateToken_expires_in_seven_days()
    {
        var token = TestAuth.GenerateToken(1, 0, "bob", "bob@example.com");
        Assert.True(TestAuth.ValidateToken(token, out var principal));
        var exp = principal?.FindFirst(JwtRegisteredClaimNames.Exp)?.Value;
        Assert.NotNull(exp);
        var expDate = DateTimeOffset.FromUnixTimeSeconds(long.Parse(exp!));
        var expected = DateTimeOffset.UtcNow.Add(TestAuth.Expiry);
        Assert.InRange(expDate, expected.AddMinutes(-1), expected.AddMinutes(1));
    }

    [Fact]
    public void ValidateToken_rejects_tampered_token()
    {
        var token = TestAuth.GenerateToken(1, 0, "bob", "bob@example.com");
        var parts = token.Split('.');
        var tampered = parts[0] + "." + parts[1] + ".zzztamperedsignature";
        Assert.False(TestAuth.ValidateToken(tampered, out _));
    }

    [Fact]
    public void ValidateToken_rejects_wrong_secret()
    {
        var token = TestAuth.GenerateToken(1, 0, "bob", "bob@example.com");
        Assert.False(TestAuth.ValidateToken(token, out _, "different-secret"));
    }

    [Fact]
    public void ValidateToken_rejects_empty_token()
    {
        Assert.False(TestAuth.ValidateToken("", out _));
        Assert.False(TestAuth.ValidateToken(null!, out _));
    }

    [Fact]
    public void GetUserId_extracts_subject()
    {
        var token = TestAuth.GenerateToken(12345, 3, "carol", "carol@example.com");
        Assert.Equal(12345, TestAuth.GetUserId(token));
    }

    [Fact]
    public void GetUserId_returns_null_for_invalid_token()
    {
        Assert.Null(TestAuth.GetUserId("not.a.jwt"));
    }

    [Fact]
    public void Token_version_in_old_token_is_still_validated_by_structure()
    {
        var v0 = TestAuth.GenerateToken(7, 0, "dave", "dave@example.com");
        var v1 = TestAuth.GenerateToken(7, 1, "dave", "dave@example.com");
        Assert.True(TestAuth.ValidateToken(v0, out _));
        Assert.True(TestAuth.ValidateToken(v1, out _));
        Assert.NotEqual(v0, v1);
    }

    [Fact]
    public void HashPassword_produces_different_hashes_each_time()
    {
        var h1 = TestAuth.HashPassword("S3cure-pass!", 12);
        var h2 = TestAuth.HashPassword("S3cure-pass!", 12);
        Assert.NotEqual(h1, h2);
        Assert.True(TestAuth.VerifyPassword("S3cure-pass!", h1));
        Assert.True(TestAuth.VerifyPassword("S3cure-pass!", h2));
    }

    [Fact]
    public void VerifyPassword_rejects_wrong_password()
    {
        var hash = TestAuth.HashPassword("S3cure-pass!", 12);
        Assert.False(TestAuth.VerifyPassword("wrong-password!", hash));
    }

    [Fact]
    public void VerifyPassword_rejects_empty_hash()
    {
        Assert.False(TestAuth.VerifyPassword("anything", ""));
        Assert.False(TestAuth.VerifyPassword("anything", null!));
    }

    [Fact]
    public void Username_length_validation()
    {
        static bool ValidUsername(string u) =>
            !string.IsNullOrWhiteSpace(u) && u.Length >= 3 && u.Length <= 32;

        Assert.False(ValidUsername("ab"));
        Assert.False(ValidUsername(new string('a', 33)));
        Assert.True(ValidUsername("abc"));
        Assert.True(ValidUsername("a".PadRight(32)));
    }

    [Fact]
    public void Password_strength_validation()
    {
        static bool ValidPassword(string p) =>
            !string.IsNullOrWhiteSpace(p) && p.Length >= 8 && p.Length <= 128
            && p.Any(char.IsLetter) && p.Any(char.IsDigit);

        Assert.False(ValidPassword("short1"));   // < 8
        Assert.False(ValidPassword("nodigits!!")); // no digit
        Assert.False(ValidPassword("12345678"));   // no letter
        Assert.True(ValidPassword("S3cure-pass!"));
        Assert.True(ValidPassword("Password1"));
    }

    [Fact]
    public void Email_validation_accepts_rejects()
    {
        static bool ValidEmail(string? e)
        {
            if (string.IsNullOrWhiteSpace(e)) return false;
            try
            {
                var addr = new MailAddress(e.Trim());
                return addr.Address == e.Trim();
            }
            catch { return false; }
        }

        Assert.True(ValidEmail("alice@example.com"));
        Assert.False(ValidEmail("not-an-email"));
        Assert.False(ValidEmail(""));
        Assert.False(ValidEmail(null!));
    }

    [Fact]
    public void Duplicate_identifier_is_case_insensitive()
    {
        var existing = new List<string> { "ALICE", "alice", "Alice" };
        var candidate = "ALICE";
        Assert.Contains(candidate.ToLowerInvariant(), existing.ConvertAll(x => x.ToLowerInvariant()));
    }
}
