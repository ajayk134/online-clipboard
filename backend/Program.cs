using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using OnlineClipboard.Middleware;
using OnlineClipboard.Services;
using System.Text;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var env = builder.Environment;
var configuration = builder.Configuration;

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// ProblemDetails for RFC 7807 error responses.
builder.Services.AddProblemDetails();
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = null;
});

// MongoDB
builder.Services.AddSingleton<IMongoDbService, MongoDbService>();
builder.Services.AddSingleton<MongoMigrationService>();

// Application services
builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<IPasswordService, PasswordService>();
builder.Services.AddScoped<IShareService, ShareService>();
builder.Services.AddScoped<ISanitizationService, SanitizationService>();
builder.Services.AddHostedService<MaintenanceService>();

// ---- JWT secret enforcement (fail fast, no hardcoded fallback) ----
var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET")
    ?? configuration["Jwt:Secret"];
if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret == "dev-secret-change-me")
{
    throw new InvalidOperationException(
        "JWT_SECRET is not configured. Set the JWT_SECRET environment variable to a strong random value.");
}
var jwtIssuer = "online-clipboard";
var key = Encoding.UTF8.GetBytes(jwtSecret);

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtIssuer,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(key),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero,
        };
    });
builder.Services.AddAuthorization();

// ---- CORS: require explicit FRONTEND_URL, never AllowAnyOrigin in production ----
var frontendUrl = Environment.GetEnvironmentVariable("FRONTEND_URL");
var corsOrigins = string.IsNullOrWhiteSpace(frontendUrl)
    ? (env.IsDevelopment() ? new[] { "*" } : Array.Empty<string>())
    : frontendUrl.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        if (corsOrigins.Length == 0)
        {
            // Production with no FRONTEND_URL: no origins configured => deny all cross-origin requests.
            // Intentionally do not call AllowAnyOrigin() or WithOrigins().
        }
        else if (corsOrigins.Contains("*"))
        {
            policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
        }
        else
        {
            policy.WithOrigins(corsOrigins).AllowAnyMethod().AllowAnyHeader();
        }
    });
});

// ---- Rate limiting ----
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

// Honor X-Forwarded-Proto/Host when behind Render's reverse proxy.
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost,
});

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/problem+json";
        var problem = new
        {
            type = "https://tools.ietf.org/html/rfc7231#section-6.6.1",
            title = "An error occurred while processing your request.",
            status = StatusCodes.Status500InternalServerError,
            traceId = context.TraceIdentifier,
        };
        await context.Response.WriteAsJsonAsync(problem);
    });
});

app.UseStatusCodePages(async context =>
{
    if (context.HttpContext.Response.StatusCode is >= 400 and < 600 &&
        string.IsNullOrEmpty(context.HttpContext.Response.ContentType))
    {
        context.HttpContext.Response.ContentType = "application/problem+json";
        var problem = new
        {
            type = $"https://httpstatuses.com/{context.HttpContext.Response.StatusCode}",
            title = context.HttpContext.Response.StatusCode switch
            {
                401 => "Authentication required",
                403 => "You do not have permission to perform this action.",
                404 => "The requested resource was not found.",
                429 => "Too many requests. Please try again later.",
                _ => "An error occurred while processing your request.",
            },
            status = context.HttpContext.Response.StatusCode,
            traceId = context.HttpContext.TraceIdentifier,
        };
        await context.HttpContext.Response.WriteAsJsonAsync(problem);
    }
});

app.UseCors("Frontend");
app.UseRateLimiter();
app.UseAuthentication();
app.UseMiddleware<AuthMiddleware>();
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

// ---- MongoDB startup initialization with retry/backoff ----
using (var scope = app.Services.CreateScope())
{
    var mongo = scope.ServiceProvider.GetRequiredService<IMongoDbService>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var retryCount = 0;
    var maxRetries = 10;
    var delay = TimeSpan.FromSeconds(2);

    while (true)
    {
        try
        {
            await mongo.ConnectAsync();
            await mongo.EnsureIndexesAsync();
            logger.LogInformation("MongoDB connected and indexes ensured");
            break;
        }
        catch (Exception ex)
        {
            retryCount++;
            if (retryCount >= maxRetries)
            {
                logger.LogError(ex, "MongoDB startup initialization failed after {Retries} retries", retryCount);
                throw;
            }
            logger.LogWarning(ex, "MongoDB startup attempt {RetryCount}/{MaxRetries} failed, retrying in {Delay}s",
                retryCount, maxRetries, delay.TotalSeconds);
            await Task.Delay(delay);
            delay = delay.Multiply(2);
        }
    }
}

// Run legacy migration on startup when requested (non-blocking, async).
using (var scope = app.Services.CreateScope())
{
    var migrate = Environment.GetEnvironmentVariable("MIGRATE_LEGACY");
    if (string.Equals(migrate, "1", StringComparison.OrdinalIgnoreCase))
    {
        try
        {
            var migration = scope.ServiceProvider.GetRequiredService<MongoMigrationService>();
            var result = await migration.MigrateAsync();
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
