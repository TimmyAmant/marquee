using System.Net;
using System.Text;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Profile photos (api-v1.md section 11, "Profile photo"): the upload sends
// the image itself in its own content type, removal sends nothing, both
// answer the new avatarUrl, and the photo is read back with the bearer
// token from the path the server handed out, never from anywhere else.

public sealed class MarqueeApiAvatarRequestTests
{
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private static readonly Guid MemberId = Guid.Parse("83C55A49-6153-4CB9-AE22-4A42D48F4CF3");
    private const string AvatarUrl = "/api/v1/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3/avatar?v=1790334036549";

    private readonly StubHttpMessageHandler stub = new();
    private readonly ServerEvents events = new();
    private int unauthorizedCalls;

    private ApiClient Client() => new(Base, Token, stub, () =>
    {
        unauthorizedCalls++;
        return Task.CompletedTask;
    });

    private MarqueeApi Api() => new(Client(), events);

    private static HttpResponseMessage Jpeg(byte[] bytes)
    {
        var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(bytes) };
        response.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/jpeg");
        return response;
    }

    // MARK: Upload and removal

    [Fact]
    public async Task UploadSendsTheImageInItsOwnContentType()
    {
        stub.AnswerJson(200, $$"""{"ok":true,"avatarUrl":"{{AvatarUrl}}"}""");
        var image = Encoding.ASCII.GetBytes("pretend-this-is-a-png");

        var result = await Api().Users.SetAvatarAsync(MemberId, image, "image/png");

        var request = Assert.Single(stub.Requests);
        Assert.Equal(HttpMethod.Put, request.Method);
        Assert.Equal("/api/v1/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3/avatar", request.Path);
        Assert.Equal($"Bearer {Token}", request.Authorization);
        Assert.Equal("image/png", request.ContentType);
        Assert.Equal("pretend-this-is-a-png", request.Body);
        Assert.Equal("application/json", request.Header("Accept"));

        Assert.True(result.Ok);
        Assert.Equal(AvatarUrl, result.AvatarUrl);
        Assert.Equal(1, events.Revision(ServerChange.Users));
        Assert.Equal(0, events.Revision(ServerChange.All & ~ServerChange.Users));
    }

    [Fact]
    public async Task UploadFromAStreamSendsTheSameBytes()
    {
        stub.AnswerJson(200, $$"""{"ok":true,"avatarUrl":"{{AvatarUrl}}"}""");
        using var image = new MemoryStream(Encoding.ASCII.GetBytes("jpeg-bytes"));

        var result = await Api().Users.SetAvatarAsync(MemberId, image, "image/jpeg");

        var request = Assert.Single(stub.Requests);
        Assert.Equal("image/jpeg", request.ContentType);
        Assert.Equal("jpeg-bytes", request.Body);
        Assert.Equal(AvatarUrl, result.AvatarUrl);
    }

    [Fact]
    public async Task RemovalSendsNoBodyAndAnswersNoPhoto()
    {
        stub.AnswerJson(200, """{"ok":true,"avatarUrl":null}""");

        var result = await Api().Users.RemoveAvatarAsync(MemberId);

        var request = Assert.Single(stub.Requests);
        Assert.Equal(HttpMethod.Delete, request.Method);
        Assert.Equal("/api/v1/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3/avatar", request.Path);
        Assert.Equal("", request.Body);
        Assert.Null(request.ContentType);
        Assert.True(result.Ok);
        Assert.Null(result.AvatarUrl);
        Assert.Equal(1, events.Revision(ServerChange.Users));
    }

    [Fact]
    public async Task APhotoOverTheCapIsRefusedBeforeSending()
    {
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            Api().Users.SetAvatarAsync(MemberId, new byte[UsersEndpoints.MaxAvatarBytes + 1], "image/jpeg"));
        Assert.Equal(ApiErrorKind.Invalid, error.Kind);
        Assert.Equal(UsersEndpoints.AvatarTooBigMessage, error.Message);

        using var big = new MemoryStream(new byte[UsersEndpoints.MaxAvatarBytes + 1]);
        var streamed = await Assert.ThrowsAsync<ApiException>(() => Api().Users.SetAvatarAsync(MemberId, big, "image/jpeg"));
        Assert.Equal(UsersEndpoints.AvatarTooBigMessage, streamed.Message);

        Assert.Empty(stub.Requests);
    }

    [Fact]
    public async Task AContentTypeThatDoesNotParseIsRefusedBeforeSending()
    {
        var error = await Assert.ThrowsAsync<ApiException>(() => Api().Users.SetAvatarAsync(MemberId, [1, 2, 3], "jpeg"));

        Assert.Equal(ApiErrorKind.Invalid, error.Kind);
        Assert.Empty(stub.Requests);
    }

    [Fact]
    public async Task AnUnreadablePhotoShowsTheServersMessage()
    {
        // HEIC, for one: the server doesn't read it.
        stub.AnswerJson(400, """{"error":"That file isn't a photo Marquee can read. Use a JPEG, PNG or WebP image.","code":"invalid"}""");

        var error = await Assert.ThrowsAsync<ApiException>(() => Api().Users.SetAvatarAsync(MemberId, [1, 2, 3], "image/heic"));

        Assert.Equal(ApiErrorKind.Invalid, error.Kind);
        Assert.Equal("That file isn't a photo Marquee can read. Use a JPEG, PNG or WebP image.", error.Message);
        Assert.Equal(0, events.Revision(ServerChange.All));
    }

    [Fact]
    public async Task SomeoneElsesPhotoIsForbidden()
    {
        stub.AnswerJson(403, """{"error":"You can only change your own photo.","code":"forbidden"}""");

        var error = await Assert.ThrowsAsync<ApiException>(() => Api().Users.RemoveAvatarAsync(MemberId));

        Assert.Equal(ApiErrorKind.Forbidden, error.Kind);
    }

    // MARK: Reading a photo back

    [Fact]
    public async Task ThePhotoIsReadFromTheServersPathWithTheToken()
    {
        var jpeg = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 0xFF, 0xD9 };
        stub.Answer(() => Jpeg(jpeg));

        var bytes = await Client().GetBytesAsync(AvatarUrl);

        Assert.Equal(jpeg, bytes);
        var request = Assert.Single(stub.Requests);
        Assert.Equal(HttpMethod.Get, request.Method);
        Assert.Equal("/api/v1/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3/avatar", request.Path);
        Assert.Equal("1790334036549", request.Query["v"]);
        Assert.Equal($"Bearer {Token}", request.Authorization);
        Assert.StartsWith("image/", request.Header("Accept"));
    }

    [Fact]
    public async Task AnAbsoluteUrlOnTheSameServerIsFine()
    {
        stub.Answer(() => Jpeg([1]));

        await Client().GetBytesAsync("http://127.0.0.1:3000" + AvatarUrl);

        Assert.Equal("/api/v1/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3/avatar", Assert.Single(stub.Requests).Path);
    }

    [Theory]
    [InlineData("//evil.example/api/v1/users/x/avatar")]
    [InlineData("https://evil.example/api/v1/users/x/avatar")]
    [InlineData("http://127.0.0.1:3001/api/v1/users/x/avatar")]
    [InlineData("/api/v1/../../settings")]
    [InlineData("/api/v1\\..\\..\\settings")]
    [InlineData("/avatars/x")]
    [InlineData("api/v1/users/x/avatar")]
    [InlineData("")]
    public async Task APathOffTheApiIsRefusedWithoutSendingTheToken(string path)
    {
        stub.Answer(() => Jpeg([1]));

        var error = await Assert.ThrowsAsync<ApiException>(() => Client().GetBytesAsync(path));

        Assert.Equal(ApiErrorKind.Invalid, error.Kind);
        Assert.Empty(stub.Requests);
    }

    [Fact]
    public async Task NoPhotoIsNotFound()
    {
        // The image route's 404 is bare: no body, no API header.
        stub.Answer(() => StubHttpMessageHandler.Empty(404, apiHeader: false));

        var error = await Assert.ThrowsAsync<ApiException>(() => Client().GetBytesAsync(AvatarUrl));

        Assert.Equal(ApiErrorKind.NotFound, error.Kind);
        Assert.Equal(0, unauthorizedCalls);
    }

    [Fact]
    public async Task ARejectedTokenReachesTheSession()
    {
        stub.AnswerJson(401, """{"error":"Unauthorized","code":"unauthorized"}""");

        var error = await Assert.ThrowsAsync<ApiException>(() => Client().GetBytesAsync(AvatarUrl));

        Assert.True(error.IsRejectedToken);
        Assert.Equal(1, unauthorizedCalls);
    }

    // MARK: Models

    [Fact]
    public void AccountsCarryTheirPhotoPath()
    {
        var user = Json.Decode<User>($$"""
            {"id":"54caac33-73d6-4864-8e12-1ea6b212d2f1","username":"timmy","displayName":"Timmy","role":"admin",
             "libraryOwnerId":"54caac33-73d6-4864-8e12-1ea6b212d2f1","avatarUrl":"{{AvatarUrl}}"}
            """);
        Assert.Equal(AvatarUrl, user.AvatarUrl);

        var me = Json.Decode<Me>($$"""
            {"id":"54caac33-73d6-4864-8e12-1ea6b212d2f1","username":"timmy","displayName":"Timmy","role":"admin",
             "libraryOwnerId":"54caac33-73d6-4864-8e12-1ea6b212d2f1","avatarUrl":"{{AvatarUrl}}",
             "autoApproveMovies":false,"autoApproveTv":false,"createdAt":"2026-09-17T17:10:57.821Z"}
            """);
        Assert.Equal(AvatarUrl, me.AvatarUrl);
        Assert.Equal(AvatarUrl, me.User.AvatarUrl);

        var member = Json.Decode<HouseholdMember>($$"""
            {"id":"83c55a49-6153-4cb9-ae22-4a42d48f4cf3","username":"member1","displayName":"Kid","role":"member",
             "autoApproveMovies":false,"autoApproveTv":true,"createdAt":"2026-09-17T17:12:40.991Z",
             "isCurrentUser":false,"avatarUrl":"{{AvatarUrl}}"}
            """);
        Assert.Equal(AvatarUrl, member.AvatarUrl);
    }

    [Fact]
    public void NoPhotoOrAnOlderServerReadsAsNull()
    {
        const string withNull = """
            {"id":"54caac33-73d6-4864-8e12-1ea6b212d2f1","username":"timmy","displayName":null,"role":"member",
             "libraryOwnerId":"54caac33-73d6-4864-8e12-1ea6b212d2f1","avatarUrl":null}
            """;
        const string without = """
            {"id":"54caac33-73d6-4864-8e12-1ea6b212d2f1","username":"timmy","displayName":null,"role":"member",
             "libraryOwnerId":"54caac33-73d6-4864-8e12-1ea6b212d2f1"}
            """;

        Assert.Null(Json.Decode<User>(withNull).AvatarUrl);
        Assert.Null(Json.Decode<User>(without).AvatarUrl);
    }

    [Fact]
    public void NotificationTitlesMatchTheServersPush()
    {
        Assert.Equal("Downloading", NotificationEventType.Grabbed.NotificationTitle);
        Assert.Equal("Ready to watch", NotificationEventType.Downloaded.NotificationTitle);
        Assert.Equal("Request approved", NotificationEventType.RequestApproved.NotificationTitle);
        Assert.Equal("Request declined", NotificationEventType.RequestRejected.NotificationTitle);
        Assert.Equal("Marquee", NotificationEventType.FromValue("something_new").NotificationTitle);
    }
}
