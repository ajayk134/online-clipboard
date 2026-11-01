using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Moq;
using OnlineClipboard.Middleware;
using OnlineClipboard.Models;
using OnlineClipboard.Services;
using Xunit;

namespace OnlineClipboard.Tests;

public class AuthMiddlewareTests
{
    [Fact]
    public void GetUserIdLong_returns_null_when_not_set()
    {
        var context = new DefaultHttpContext();
        Assert.Null(context.GetUserIdLong());
    }

    [Fact]
    public void GetUserIdLong_returns_set_value()
    {
        var context = new DefaultHttpContext();
        context.Items["UserId"] = 42L;
        Assert.Equal(42L, context.GetUserIdLong());
    }

    [Fact]
    public void GetTokenVersion_returns_null_when_not_set()
    {
        var context = new DefaultHttpContext();
        Assert.Null(context.GetTokenVersion());
    }

    [Fact]
    public void GetTokenVersion_returns_set_value()
    {
        var context = new DefaultHttpContext();
        context.Items["TokenVersion"] = 3;
        Assert.Equal(3, context.GetTokenVersion());
    }

    [Fact]
    public void GetToken_returns_null_when_not_set()
    {
        var context = new DefaultHttpContext();
        Assert.Null(context.GetToken());
    }

    [Fact]
    public async Task Middleware_does_not_set_user_without_authorization_header()
    {
        var db = new Mock<IMongoDbService>();
        var jwt = new Mock<IJwtService>();

        var middleware = new AuthMiddleware((inner) => Task.CompletedTask);
        var context = new DefaultHttpContext();
        context.User = new ClaimsPrincipal(new ClaimsIdentity());

        await middleware.InvokeAsync(context, jwt.Object, db.Object);

        Assert.Null(context.Items["UserId"]);
        Assert.False(context.User?.Identity?.IsAuthenticated ?? false);
        jwt.Verify(j => j.ValidateToken(It.IsAny<string>(), out It.Ref<ClaimsPrincipal?>.IsAny), Times.Never);
    }

    [Fact]
    public async Task Middleware_rejects_invalid_token()
    {
        var db = new Mock<IMongoDbService>();
        var jwt = new Mock<IJwtService>();
        jwt.Setup(j => j.ValidateToken(It.IsAny<string>(), out It.Ref<ClaimsPrincipal?>.IsAny))
            .Returns((string _, out ClaimsPrincipal? p) => { p = null; return false; });

        var middleware = new AuthMiddleware((inner) => Task.CompletedTask);
        var context = new DefaultHttpContext();
        context.Request.Headers.Authorization = "Bearer invalid-token";
        context.User = new ClaimsPrincipal(new ClaimsIdentity());

        await middleware.InvokeAsync(context, jwt.Object, db.Object);

        Assert.Null(context.Items["UserId"]);
        Assert.False(context.User?.Identity?.IsAuthenticated ?? false);
    }
}
