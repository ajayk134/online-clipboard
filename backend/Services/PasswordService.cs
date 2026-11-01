using BCrypt.Net;

namespace OnlineClipboard.Services;

public interface IPasswordService
{
    string Hash(string password, int rounds = 12);
    bool Verify(string password, string hash);
}

public class PasswordService : IPasswordService
{
    public string Hash(string password, int rounds = 12)
    {
        return BCrypt.Net.BCrypt.HashPassword(password, rounds);
    }

    public bool Verify(string password, string hash)
    {
        if (string.IsNullOrEmpty(hash))
            return false;
        try
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch
        {
            return false;
        }
    }
}
