using Marquee.Core.Api;

namespace Marquee.Core.Tests.Localization;

/// <summary>
/// Since 0.50 the server writes its error texts in the account's language,
/// so the two errors the app acts on are recognized by their stable
/// <c>reason</c>; an older server sends none and always writes English.
/// </summary>
public sealed class ErrorReasonTests
{
    [Fact]
    public void SonarrUnresolvedByReasonInAnyLanguage()
    {
        var error = ApiException.FromResponse(409,
            """{"error":"Impossible d’identifier cette série pour Sonarr.","code":"conflict","reason":"sonarr_unresolved"}""");
        Assert.Equal("sonarr_unresolved", error.Reason);
        Assert.True(error.IsSonarrUnresolvable);
    }

    [Fact]
    public void SonarrUnresolvedByTextFromAnOlderServer()
    {
        var error = ApiException.FromResponse(409,
            """{"error":"Couldn't resolve this show for Sonarr.","code":"conflict"}""");
        Assert.Null(error.Reason);
        Assert.True(error.IsSonarrUnresolvable);
    }

    [Fact]
    public void AnotherConflictIsNotSonarrUnresolved()
    {
        Assert.False(ApiException.FromResponse(409, """{"error":"Already requested.","code":"conflict"}""").IsSonarrUnresolvable);
        Assert.False(ApiException.FromResponse(409,
            """{"error":"Couldn't resolve this show for Sonarr.","code":"conflict","reason":"something_else"}""").IsSonarrUnresolvable);
    }

    [Fact]
    public void TmdbUnconfiguredByReasonInAnyLanguage()
    {
        var error = ApiException.FromResponse(502,
            """{"error":"TMDb no está configurado en este servidor.","code":"upstream","reason":"tmdb_not_configured"}""");
        Assert.True(error.IsTmdbUnconfigured());
    }

    [Fact]
    public void TmdbUnconfiguredByTextFromAnOlderServer()
    {
        var error = ApiException.FromResponse(502,
            $$"""{"error":"{{TmdbErrors.UnconfiguredMessage}}","code":"upstream"}""");
        Assert.True(error.IsTmdbUnconfigured());
        Assert.False(ApiException.FromResponse(502, """{"error":"TMDb timed out.","code":"upstream"}""").IsTmdbUnconfigured());
    }
}
