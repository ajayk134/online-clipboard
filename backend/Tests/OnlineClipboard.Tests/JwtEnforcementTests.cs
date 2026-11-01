using System.Collections.Generic;
using Microsoft.Extensions.Configuration;
using OnlineClipboard.Services;
using Xunit;

namespace OnlineClipboard.Tests;

public class JwtEnforcementTests
{
    [Fact]
    public void JwtService_throws_when_secret_is_missing()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        // No JWT_SECRET env var and no Jwt:Secret config => should throw.
        Assert.Throws<InvalidOperationException>(() => new JwtService(config));
    }

    [Fact]
    public void JwtService_uses_env_var_secret()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", "env-var-secret-for-testing-only");
        try
        {
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>())
                .Build();
            var service = new JwtService(config);
            Assert.NotNull(service);
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", null);
        }
    }

    [Fact]
    public void JwtService_uses_config_secret_when_env_missing()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", null);
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Jwt:Secret"] = "config-secret-for-testing-only",
            }).Build();
        var service = new JwtService(config);
        Assert.NotNull(service);
    }

    [Fact]
    public void JwtService_rejects_hardcoded_dev_secret()
    {
        Environment.SetEnvironmentVariable("JWT_SECRET", "dev-secret-change-me");
        try
        {
            var config = new ConfigurationBuilder()
                .AddInMemoryCollection(new Dictionary<string, string?>())
                .Build();
            // The dev fallback secret must be rejected at startup.
            Assert.Throws<InvalidOperationException>(() => new JwtService(config));
        }
        finally
        {
            Environment.SetEnvironmentVariable("JWT_SECRET", null);
        }
    }
}
