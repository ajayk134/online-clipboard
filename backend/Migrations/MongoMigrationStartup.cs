using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using OnlineClipboard.Services;

namespace OnlineClipboard.Migrations;

public static class MongoMigrationStartup
{
    public static IHost MigrateLegacyIfRequested(this IHost host)
    {
        var migrate = Environment.GetEnvironmentVariable("MIGRATE_LEGACY");
        if (!string.Equals(migrate, "1", StringComparison.OrdinalIgnoreCase))
        {
            return host;
        }

        using var scope = host.Services.CreateScope();
        var migration = scope.ServiceProvider.GetRequiredService<MongoMigrationService>();
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<MongoMigrationService>>();

        try
        {
            var result = migration.MigrateAsync().GetAwaiter().GetResult();
            logger.LogInformation("Legacy migration ran: skipped={Skipped} users={Users} clips={Clips} audit={Audit}",
                result.Skipped, result.Users, result.Clips, result.AuditLog);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Legacy migration failed");
            throw;
        }

        return host;
    }
}
