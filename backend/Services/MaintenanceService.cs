using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using OnlineClipboard.Models;

namespace OnlineClipboard.Services;

public interface IMaintenanceService
{
    Task PurgeExpiredAsync(CancellationToken ct);
}

public class MaintenanceService : BackgroundService, IMaintenanceService
{
    private readonly IMongoDbService _db;
    private readonly ILogger<MaintenanceService> _logger;
    private readonly TimeSpan _interval = TimeSpan.FromHours(1);

    public MaintenanceService(IMongoDbService db, ILogger<MaintenanceService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public Task PurgeExpiredAsync(CancellationToken ct)
    {
        var cutoff = DateTime.UtcNow.AddDays(-7);
        var filter = Builders<Clip>.Filter.And(
            Builders<Clip>.Filter.Lt(c => c.ExpiresAt, cutoff),
            Builders<Clip>.Filter.Exists(c => c.ExpiresAt));
        return _db.Clips.DeleteManyAsync(filter, ct);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(_interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await PurgeExpiredAsync(stoppingToken);
                _logger.LogInformation("Maintenance purge completed at {Time}", DateTime.UtcNow);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Maintenance purge failed");
            }
        }
    }
}
