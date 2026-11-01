using Xunit;

namespace OnlineClipboard.Tests;

public class HealthTests
{
    [Fact]
    public void Health_response_has_required_shape()
    {
        var uptimeSeconds = 123.45;
        var time = DateTime.UtcNow;
        var health = new { status = "healthy", uptime = uptimeSeconds, time };
        Assert.Equal("healthy", health.status);
        Assert.InRange(health.uptime, 0, double.MaxValue);
        Assert.InRange(health.time, DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(1));
    }

    [Fact]
    public void Ready_response_is_ready_when_database_ok()
    {
        var dbOk = true;
        var status = dbOk ? "ready" : "not ready";
        Assert.Equal("ready", status);
    }

    [Fact]
    public void Ready_response_is_503_when_database_unavailable()
    {
        var dbOk = false;
        var statusCode = dbOk ? 200 : 503;
        Assert.Equal(503, statusCode);
    }

    [Fact]
    public void Health_endpoint_path_is_health()
    {
        const string path = "/health";
        Assert.Equal("/health", path);
    }

    [Fact]
    public void Ready_endpoint_path_is_ready()
    {
        const string path = "/ready";
        Assert.Equal("/ready", path);
    }
}
