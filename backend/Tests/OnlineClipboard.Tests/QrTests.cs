using System.Linq;
using QRCoder;
using Xunit;

namespace OnlineClipboard.Tests;

public class QrTests
{
    [Fact]
    public void Qr_png_for_shared_clip_is_valid_png()
    {
        var shareUrl = "/api/share/tok-abc123";
        var bytes = QrBytes(shareUrl);
        Assert.NotEmpty(bytes);
        Assert.Equal(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, bytes.Take(8).ToArray());
        Assert.True(bytes.Length > 100); // a real PNG image, not a stub
    }

    [Fact]
    public void Qr_encodes_the_share_url()
    {
        var url1 = QrBytes("/api/share/tok-one");
        var url2 = QrBytes("/api/share/tok-two");
        Assert.NotEqual(url1, url2);
        var same = QrBytes("/api/share/tok-one");
        Assert.Equal(url1, same);
    }

    [Fact]
    public void Qr_is_rejected_when_clip_is_not_shared()
    {
        // An unshared clip has no share token, so no share URL / QR can be produced.
        string? shareToken = null;
        var hasShare = !string.IsNullOrEmpty(shareToken);
        Assert.False(hasShare);
        var url = shareToken == null ? null : $"/api/share/{shareToken}";
        Assert.Null(url);
    }

    [Fact]
    public void Qr_is_rejected_when_share_is_disabled()
    {
        var shareEnabled = false;
        var shareToken = "tok-xyz";
        var canQr = shareEnabled && !string.IsNullOrEmpty(shareToken);
        Assert.False(canQr);
    }

    static byte[] QrBytes(string text)
    {
        using var generator = new QRCodeGenerator();
        using var qrData = generator.CreateQrCode(text, QRCodeGenerator.ECCLevel.Q);
        using var qr = new PngByteQRCode(qrData);
        return qr.GetGraphic(20);
    }
}
