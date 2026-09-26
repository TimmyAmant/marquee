using System.Text.Json.Nodes;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// "Share a title" (0.45+): the doc's GET /users/shareable example decoded,
// the request body matching the shared fixture, and the dialog's rules
// (lib/sharing/parse.ts, components/share-button.tsx) in TitleShareForm.

public sealed class SharingFixtureTests
{
    private static readonly Guid KidId = Guid.Parse("83c55a49-6153-4cb9-ae22-4a42d48f4cf3");
    private static readonly Guid SusanId = Guid.Parse("0f6f3d1c-6e2a-4c1b-9d0e-2b8f5a7c4e19");
    private static readonly TitleId IceAge = new(MediaType.Movie, 425);
    private static readonly Uri Server = new("http://192.168.1.20:3000");

    [Fact]
    public void ShareableUsersDecode()
    {
        var response = Fixtures.Decode<ShareableUsersResponse>("users-shareable");

        var user = Assert.Single(response.Results);
        Assert.Equal(KidId, user.UserId);
        Assert.Equal("Kid", user.DisplayName);
        Assert.Equal("member1", user.Username);
        Assert.Equal("Kid", user.Label);
        Assert.Null(user.AvatarUrl);
        Assert.Equal("https://marquee.example.com", response.PublicUrl);
    }

    [Fact]
    public void NoPublicAddressDecodesAsNull()
    {
        var json = Fixtures.Read("users-shareable").ReplaceLineEndings("\n")
            .Replace("\"publicUrl\": \"https://marquee.example.com\"", "\"publicUrl\": null", StringComparison.Ordinal);
        Assert.Contains("\"publicUrl\": null", json, StringComparison.Ordinal);

        Assert.Null(Json.Decode<ShareableUsersResponse>(json).PublicUrl);
        Assert.Empty(Json.Decode<ShareableUsersResponse>("""{"results":[],"publicUrl":null}""").Results);
    }

    [Fact]
    public void TheBodyEncodesAsTheSharedFixture()
    {
        var body = new ShareTitleBody([KidId], "You'd love this one");
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(Fixtures.Read("share-title-body")), JsonNode.Parse(Json.EncodeBodyToString(body))), Json.EncodeBodyToString(body));
    }

    [Fact]
    public void ABodyWithoutANoteLeavesItOut()
    {
        var encoded = JsonNode.Parse(Json.EncodeBodyToString(new ShareTitleBody([KidId])))!.AsObject();
        Assert.False(encoded.ContainsKey("note"));
        Assert.Equal("83c55a49-6153-4cb9-ae22-4a42d48f4cf3", encoded["userIds"]![0]!.GetValue<string>());
    }

    [Fact]
    public void TheResponseDecodes()
    {
        var response = Json.Decode<ShareTitleResponse>("""{"ok":true,"sharedWith":3}""");
        Assert.True(response.Ok);
        Assert.Equal(3, response.SharedWith);
    }

    [Fact]
    public void TitleSharedIsAKnownEventType()
    {
        Assert.Equal(NotificationEventType.TitleShared, NotificationEventType.FromValue("title_shared"));
        Assert.Contains(NotificationEventType.TitleShared, NotificationEventType.Known);
        Assert.Equal("📨", NotificationEventType.TitleShared.Emoji);
        Assert.Equal("Shared with you", NotificationEventType.TitleShared.NotificationTitle);
    }

    // MARK: Links

    [Fact]
    public void TheMarqueeLinkUsesThePublicAddress()
    {
        Assert.Equal("https://marquee.example.com/title/movie/425", TitleShareForm.MarqueeUrl(IceAge, "https://marquee.example.com", Server)?.AbsoluteUri);
        // A trailing slash (the server strips it, but still) doesn't double up.
        Assert.Equal("https://marquee.example.com/title/tv/1396", TitleShareForm.MarqueeUrl(new TitleId(MediaType.Tv, 1396), "https://marquee.example.com/", Server)?.AbsoluteUri);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not a url")]
    [InlineData("ftp://marquee.example.com")]
    public void WithoutAPublicAddressTheLinkUsesTheServerThisAppIsOn(string? publicUrl)
    {
        Assert.Equal("http://192.168.1.20:3000/title/movie/425", TitleShareForm.MarqueeUrl(IceAge, publicUrl, Server)?.AbsoluteUri);
    }

    [Fact]
    public void NoAddressAtAllMeansNoMarqueeLink()
    {
        Assert.Null(TitleShareForm.MarqueeUrl(IceAge, null, null));
        var options = TitleShareForm.LinkOptions(IceAge, "Ice Age", null, null, null);
        Assert.Equal([ShareLinkKind.Tmdb], options.Select(option => option.Kind));
    }

    [Fact]
    public void ThePublicPages()
    {
        Assert.Equal("https://www.themoviedb.org/movie/425", TitleShareForm.TmdbUrl(IceAge).AbsoluteUri);
        Assert.Equal("https://www.themoviedb.org/tv/1396", TitleShareForm.TmdbUrl(new TitleId(MediaType.Tv, 1396)).AbsoluteUri);
        Assert.Equal("https://www.imdb.com/title/tt0268380/", TitleShareForm.ImdbUrl("tt0268380")?.AbsoluteUri);
        Assert.Null(TitleShareForm.ImdbUrl(null));
        Assert.Null(TitleShareForm.ImdbUrl(""));
        Assert.Null(TitleShareForm.ImdbUrl("nm0000123"));
        Assert.Null(TitleShareForm.ImdbUrl("tt12/../x"));
    }

    [Fact]
    public void LinkChoicesFollowTheWebsite()
    {
        var options = TitleShareForm.LinkOptions(IceAge, "Ice Age", "tt0268380", "https://marquee.example.com", Server);

        Assert.Equal([ShareLinkKind.Marquee, ShareLinkKind.Tmdb, ShareLinkKind.Imdb], options.Select(option => option.Kind));
        Assert.Equal("Marquee — they'll need to sign in", options[0].Label);
        Assert.Equal("TMDb — anyone can open it", options[1].Label);
        Assert.Equal("IMDb — anyone can open it", options[2].Label);
        Assert.Equal("https://marquee.example.com/title/movie/425", options[0].Url.AbsoluteUri);
        Assert.Equal("Ice Age on Marquee", options[0].Text);
        Assert.Equal("Ice Age", options[1].Text);
        Assert.Equal("Ice Age", options[2].Text);
        Assert.Equal(options[0].Label, options[0].ToString());
    }

    [Fact]
    public void WithoutAnImdbIdThereIsNoImdbChoice()
    {
        var options = TitleShareForm.LinkOptions(IceAge, "Ice Age", null, null, Server);
        Assert.Equal([ShareLinkKind.Marquee, ShareLinkKind.Tmdb], options.Select(option => option.Kind));
        Assert.Equal("http://192.168.1.20:3000/title/movie/425", options[0].Url.AbsoluteUri);
    }

    // MARK: Sending

    [Fact]
    public void NobodyPickedSaysSo()
    {
        var (body, error) = TitleShareForm.Build([], "hi");
        Assert.Null(body);
        Assert.Equal("Pick who to share it with.", error);
    }

    [Fact]
    public void PickedPeopleAndANoteMakeTheBody()
    {
        var (body, error) = TitleShareForm.Build([KidId, SusanId, KidId], "  You'd love this one \n");
        Assert.Null(error);
        Assert.NotNull(body);
        Assert.Equal([KidId, SusanId], body.UserIds);
        Assert.Equal("You'd love this one", body.Note);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  \n ")]
    public void ABlankNoteIsLeftOut(string? note)
    {
        var (body, _) = TitleShareForm.Build([KidId], note);
        Assert.NotNull(body);
        Assert.Null(body.Note);
    }

    [Fact]
    public void TheNoteLimitCountsCharactersNotUtf16Units()
    {
        var emoji = string.Concat(Enumerable.Repeat("🎬", 280));
        Assert.Equal(280, TitleShareForm.NoteLength(emoji));
        Assert.NotNull(TitleShareForm.Build([KidId], emoji).Body);

        var (body, error) = TitleShareForm.Build([KidId], new string('a', 281));
        Assert.Null(body);
        Assert.Equal("Keep the note under 280 characters.", error);
    }

    [Fact]
    public void TooManyPeopleAtOnce()
    {
        var (body, error) = TitleShareForm.Build(Enumerable.Range(0, 21).Select(_ => Guid.NewGuid()), null);
        Assert.Null(body);
        Assert.Equal("Share with at most 20 people at a time.", error);
    }

    [Fact]
    public void TheCounterShowsOnceTheNoteIsClose()
    {
        Assert.Null(TitleShareForm.NoteCounter(null));
        Assert.Null(TitleShareForm.NoteCounter(new string('a', 240)));
        Assert.Equal("241/280", TitleShareForm.NoteCounter(new string('a', 241)));
        Assert.Equal("300/280", TitleShareForm.NoteCounter(new string('a', 300)));
    }

    [Fact]
    public void WhatItSaysOnceSent()
    {
        Assert.Equal("Sent to Kid.", TitleShareForm.SentMessage(["Kid"], 1));
        Assert.Equal("Sent to 3 people.", TitleShareForm.SentMessage(["Kid", "Susan", "Anna"], 3));
        Assert.Equal("No one else has an account here yet.", TitleShareForm.NoOneElseMessage);
    }
}
