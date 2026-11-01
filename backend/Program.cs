using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using OnlineClipboard.Services;
using System.Text;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var env = builder.Environment;
var configuration = builder.Configuration;

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// MongoDB
builder.Services.AddSingleton<IMongoDbService, MongoDbService>();
builder.Services.AddSingleton<MongoMigrationService>();

// Application services
builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<IPasswordService, PasswordService>();
builder.Services.AddScoped<IShareService, ShareService>();
builder.Services.AddScoped<ISanitizationService, SanitizationService>();
builder.Services.AddHostedService<MaintenanceService>();

// JWT authentication
var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET")
    ?? configuration["Jwt:Secret"]
    ?? "dev-secret-change-me";
var jwtIssuer = "online-clipboard";
var key = Encoding.UTF8.GetBytes(jwtSecret);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = false,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(key),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });
builder.Services.AddAuthorization();

// CORS
var frontendUrl = Environment.GetEnvironmentVariable("FRONTEND_URL");
var corsOrigins = string.IsNullOrWhiteSpace(frontendUrl) && env.IsDevelopment()
    ? new[] { "*" }
    : string.IsNullOrWhiteSpace(frontendUrl)
        ? Array.Empty<string>()
        : frontendUrl.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        if (corsOrigins.Length == 0 || corsOrigins.Contains("*"))
            policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
        else
            policy.WithOrigins(corsOrigins).AllowAnyMethod().AllowAnyHeader();
    });
});

// Rate limiting
builder.Services.AddRateLimiter(rateLimiterOptions =>
{
    rateLimiterOptions.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(httpContext =>
        RateLimitPartition.GetFixedWindowLimiter("global", _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(15),
            PermitLimit = 600,
            QueueLimit = 0
        }));

    rateLimiterOptions.AddPolicy("auth", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter("auth", _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(15),
            PermitLimit = 30,
            QueueLimit = 0
        }));

    rateLimiterOptions.AddPolicy("write", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter("write", _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(15),
            PermitLimit = 240,
            QueueLimit = 0
        }));

    rateLimiterOptions.AddPolicy("share", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter("share", _ => new FixedWindowRateLimiterOptions
        {
            Window = TimeSpan.FromMinutes(15),
            PermitLimit = 40,
            QueueLimit = 0
        }));
});

var app = builder.Build();

if (env.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

app.UseCors("Frontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapGet("/health", () => Results.Ok(new { status = "healthy", time = DateTime.UtcNow }));
app.MapGet("/ready", (IMongoDbService mongo) =>
{
    try
    {
        return mongo.Ping()
            ? Results.Ok(new { status = "ready" })
            : Results.StatusCode(503);
    }
    catch
    {
        return Results.StatusCode(503);
    }
});

// Run legacy migration on startup when requested.
using (var scope = app.Services.CreateScope())
{
    var migrate = Environment.GetEnvironmentVariable("MIGRATE_LEGACY");
    if (string.Equals(migrate, "1", StringComparison.OrdinalIgnoreCase))
    {
        try
        {
            var migration = scope.ServiceProvider.GetRequiredService<MongoMigrationService>();
            var result = migration.MigrateAsync().GetAwaiter().GetResult();
            var logger = scope.ServiceProvider.GetRequiredService<ILogger<MongoMigrationService>>();
            logger.LogInformation("Startup migration: skipped={Skipped} users={Users} clips={Clips} audit={Audit}",
                result.Skipped, result.Users, result.Clips, result.AuditLog);
        }
        catch (Exception ex)
        {
            var logger = scope.ServiceProvider.GetRequiredService<ILogger<MongoMigrationService>>();
            logger.LogError(ex, "Startup migration failed");
        }
    }
}

app.Run();
