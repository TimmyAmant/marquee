using System.Text.Json.Nodes;
using Marquee.Core.Api;
using Marquee.Core.Connection;
using Marquee.Core.Localization;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests.Localization;

/// <summary>
/// Which language the app shows (the account's choice, else Windows', else
/// English), <c>GET /me</c>'s <c>language</c> and <c>PATCH /me</c>
/// (api-v1.md deviation 19), the plural rule and the Accept-Language header.
/// </summary>
public sealed class LanguageTests
{
    private static readonly Uri Base = new("http://127.0.0.1:3000");
    private const string Token = "mqt_testtesttesttesttesttesttesttesttesttesttes";

    [Theory]
    [InlineData("fr", new[] { "de-DE" }, "fr")]
    [InlineData("PT-br", new string[0], "pt-BR")]
    [InlineData(null, new[] { "de-AT", "en-US" }, "de")]
    [InlineData(null, new[] { "nl-NL", "es-MX" }, "es")]
    [InlineData(null, new[] { "pt-PT" }, "pt-BR")]
    [InlineData(null, new[] { "ja-JP" }, "en")]
    [InlineData(null, new string[0], "en")]
    [InlineData("xx", new[] { "fr-CA" }, "fr")]
    [InlineData("", new[] { "en-GB", "fr-FR" }, "en")]
    public void ResolvesTheAccountsChoiceThenWindowsThenEnglish(string? chosen, string[] system, string expected) =>
        Assert.Equal(expected, AppLanguage.Resolve(chosen, system));

    [Fact]
    public void EveryLanguageHasItsOwnName()
    {
        Assert.Equal(["en", "es", "fr", "de", "pt-BR"], AppLanguage.Supported);
        Assert.Equal(
            ["English", "Español", "Français", "Deutsch", "Português (Brasil)"],
            AppLanguage.Supported.Select(AppLanguage.NativeName));
    }

    [Fact]
    public void TheChoiceRoundTripsThroughTheStore()
    {
        var store = new InMemorySettingsStore();
        Assert.Null(AppLanguage.ReadChoice(store));
        AppLanguage.WriteChoice(store, "pt-BR");
        Assert.Equal("pt-BR", store.GetString(AppLanguage.SettingKey));
        Assert.Equal("pt-BR", AppLanguage.ReadChoice(store));
        AppLanguage.WriteChoice(store, null);
        Assert.Null(store.GetString(AppLanguage.SettingKey));
        store.SetString(AppLanguage.SettingKey, "klingon");
        Assert.Null(AppLanguage.ReadChoice(store));
    }

    [Theory]
    [InlineData("en", 0, false)]
    [InlineData("en", 1, true)]
    [InlineData("en", 2, false)]
    [InlineData("de", 1, true)]
    [InlineData("de", 0, false)]
    [InlineData("es", 1, true)]
    [InlineData("fr", 0, true)]
    [InlineData("fr", 1, true)]
    [InlineData("fr", 2, false)]
    [InlineData("pt-BR", 0, true)]
    [InlineData("pt-BR", 1, true)]
    [InlineData("pt-BR", 5, false)]
    public void PluralRule(string language, long count, bool singular) =>
        Assert.Equal(singular, Loc.IsSingular(count, language));

    [Fact]
    public void AnUnknownKeyShowsItself()
    {
        Assert.Equal("No_Such_Key_Anywhere", Loc.Get("No_Such_Key_Anywhere"));
    }

    [Fact]
    public void MeDecodesTheLanguage()
    {
        var me = Fixtures.Decode<Me>("me");
        Assert.Equal(new AccountLanguage("fr"), me.Language);
        Assert.Equal("fr", me.User.Language?.Code);

        // The same /me as a User, as the session reads it.
        Assert.Equal("fr", Fixtures.Decode<User>("me").Language?.Code);
    }

    [Fact]
    public void NullIsAutomaticAndMissingIsAnOlderServer()
    {
        var automatic = Json.Decode<Me>(Fixtures.Read("me").Replace("\"language\": \"fr\"", "\"language\": null", StringComparison.Ordinal));
        Assert.NotNull(automatic.Language);
        Assert.Null(automatic.Language!.Code);

        var node = JsonNode.Parse(Fixtures.Read("me"))!.AsObject();
        Assert.True(node.Remove("language"));
        var older = Json.Decode<Me>(node.ToJsonString());
        Assert.Null(older.Language);
    }

    [Theory]
    [InlineData("de", """{"language":"de"}""")]
    [InlineData(null, """{"language":null}""")]
    public async Task PatchMeSendsTheLanguageNullIncluded(string? language, string body)
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("me");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        var me = await api.SetLanguageAsync(language);

        var request = Assert.Single(stub.Requests);
        Assert.Equal("PATCH", request.Method.Method);
        Assert.Equal("/api/v1/me", request.Path);
        Assert.Equal(body, request.Body);
        Assert.Equal("application/json", request.ContentType);
        Assert.Equal("timmy", me.Username);
    }

    [Fact]
    public async Task EveryRequestSaysWhichLanguageTheAppShows()
    {
        var stub = new StubHttpMessageHandler();
        stub.AnswerFixture("me");
        var api = new MarqueeApi(new ApiClient(Base, Token, stub));

        await api.MeAsync();

        Assert.Equal(AppLanguage.Current, Assert.Single(stub.Requests).Header("Accept-Language"));
    }
}
