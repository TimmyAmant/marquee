using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// "Share a title" (0.45+): each call sends the method, path and body the doc
// specifies. A share notifies other people only, so nothing is recorded.

public sealed class MarqueeApiSharingRequestTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";

    // Uppercase on purpose: the body carries the lowercase form.
    private static readonly Guid KidId = Guid.Parse("83C55A49-6153-4CB9-AE22-4A42D48F4CF3");

    private static (MarqueeApi Api, StubHttpMessageHandler Stub, List<ServerChangedEventArgs> Raised) Make(Action<StubHttpMessageHandler> answer)
    {
        var stub = new StubHttpMessageHandler();
        answer(stub);
        var events = new ServerEvents();
        var raised = new List<ServerChangedEventArgs>();
        events.Changed += (_, args) => raised.Add(args);
        return (new MarqueeApi(new ApiClient(Base, Token, stub), events), stub, raised);
    }

    [Fact]
    public async Task ListShareableUsersIsAPlainGet()
    {
        var (api, stub, raised) = Make(stub => stub.AnswerFixture("users-shareable"));

        var response = await api.Sharing.ListShareableUsersAsync();

        var request = Assert.Single(stub.Requests);
        Assert.Equal("GET", request.Method.Method);
        Assert.Equal("/api/v1/users/shareable", request.Path);
        Assert.Empty(request.Query);
        Assert.Equal("", request.Body);
        Assert.Empty(raised);
        Assert.Equal("Kid", Assert.Single(response.Results).Label);
        Assert.Equal("https://marquee.example.com", response.PublicUrl);
    }

    [Fact]
    public async Task ShareTitleSendsTheSharedFixtureBody()
    {
        var (api, stub, raised) = Make(stub => stub.AnswerJson(200, """{"ok":true,"sharedWith":1}"""));

        var sharedWith = await api.Sharing.ShareTitleAsync(MediaType.Movie, 425, new ShareTitleBody([KidId], "You'd love this one"));

        Assert.Equal(1, sharedWith);
        var request = Assert.Single(stub.Requests);
        Assert.Equal("POST", request.Method.Method);
        Assert.Equal("/api/v1/titles/movie/425/share", request.Path);
        Assert.Empty(request.Query);
        Assert.Equal("application/json", request.ContentType);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(Fixtures.Read("share-title-body")), request.JsonBody), request.Body);
        Assert.Empty(raised);
    }

    [Fact]
    public async Task ShareTitleWithoutANoteSendsOnlyTheIds()
    {
        var (api, stub, _) = Make(stub => stub.AnswerJson(200, """{"ok":true,"sharedWith":2}"""));

        var sharedWith = await api.Sharing.ShareTitleAsync(MediaType.Tv, 1396, new ShareTitleBody([KidId, Guid.Parse("0f6f3d1c-6e2a-4c1b-9d0e-2b8f5a7c4e19")]));

        Assert.Equal(2, sharedWith);
        var request = Assert.Single(stub.Requests);
        Assert.Equal("/api/v1/titles/tv/1396/share", request.Path);
        Assert.True(JsonNode.DeepEquals(
            JsonNode.Parse("""{"userIds":["83c55a49-6153-4cb9-ae22-4a42d48f4cf3","0f6f3d1c-6e2a-4c1b-9d0e-2b8f5a7c4e19"]}"""),
            request.JsonBody), request.Body);
    }

    [Theory]
    [InlineData(400, "invalid", "You can't share with yourself.")]
    [InlineData(429, "rate_limited", "That's a lot of sharing in a short time. Try again in a while.")]
    public async Task ARefusalCarriesTheServersMessage(int status, string code, string message)
    {
        var (api, _, raised) = Make(stub => stub.AnswerJson(status, $$"""{"code":"{{code}}","error":"{{message}}"}"""));

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            api.Sharing.ShareTitleAsync(MediaType.Movie, 425, new ShareTitleBody([KidId])));

        Assert.Equal(message, error.Message);
        Assert.Empty(raised);
    }

    [Fact]
    public async Task AnAccountThatIsGoneIsNotFound()
    {
        // NotFound carries no server text: the dialog says it in its own words.
        var (api, _, _) = Make(stub => stub.AnswerJson(404, """{"code":"not_found","error":"Someone you picked isn't in this household any more."}"""));

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            api.Sharing.ShareTitleAsync(MediaType.Movie, 425, new ShareTitleBody([KidId])));

        Assert.Equal(ApiErrorKind.NotFound, error.Kind);
        Assert.Equal("Someone you picked isn't in this household any more.", TitleShareForm.RecipientGoneMessage);
    }
}
