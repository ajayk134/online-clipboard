using System.Security.Cryptography;
using QRCoder;

namespace OnlineClipboard.Services;

public interface IShareService
{
    string GenerateToken();
    byte[] GenerateQrCode(string text);
}

public class ShareService : IShareService
{
    private static readonly char[] Base64UrlChars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".ToCharArray();

    public string GenerateToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(24);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    public byte[] GenerateQrCode(string text)
    {
        using var generator = new QRCodeGenerator();
        using var qrCodeData = generator.CreateQrCode(text, QRCodeGenerator.ECCLevel.Q);
        using var qrCode = new PngByteQRCode(qrCodeData);
        return qrCode.GetGraphic(20);
    }
}
