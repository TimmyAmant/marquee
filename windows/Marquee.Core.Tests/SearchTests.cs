using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// Search in sections (0.55+), the Mac's SearchTests: the page's order —
// Movies, TV Shows, People, Studios & Networks — from a new server and an
// older one, the theme's place, the type-ahead's groups, and kinds this
// build doesn't know.

public sealed class SearchTests
{
    private static string Card(int id, string type) =>
        $$"""{"mediaType":"{{type}}","tmdbId":{{id}},"name":"T{{id}}","posterPath":null,"year":"2021","subtitle":null,"overview":null,"rating":null,"status":null,"favorited":false,"requested":false,"canQuickAdd":false,"canRequest":false}""";

    private const string Person = """{"tmdbId":31,"name":"Tom Hanks","profilePath":"/t.jpg","knownForDepartment":"Acting","favorited":false,"knownFor":["Forrest Gump","Cast Away"]}""";

    private static string NewServer(string placement) => $$"""
        {
          "query": "dune",
          "people": [{{Person}}],
          "studios": [],
          "titles": [{{Card(1, "movie")}}, {{Card(2, "tv")}}],
          "theme": { "label": "Horror", "items": [{{Card(3, "movie")}}], "placement": "{{placement}}" },
          "sections": {
            "movies": { "totalResults": 40, "totalPages": 2, "results": [{{Card(1, "movie")}}] },
            "series": { "totalResults": 1, "totalPages": 1, "results": [{{Card(2, "tv")}}] },
            "people": { "totalResults": 1, "totalPages": 1, "results": [{{Person}}] },
            "studiosAndNetworks": { "totalResults": 2, "totalPages": 1, "results": [
              { "kind": "network", "tmdbId": 49, "name": "HBO", "logoPath": "/h.png", "favorited": null },
              { "kind": "studio", "tmdbId": 3268, "name": "HBO", "logoPath": null, "favorited": false }
            ] }
          }
        }
        """;

    [Fact]
    public void SectionsComeInThePagesOrder()
    {
        var results = Json.Decode<SearchResults>(NewServer("last"));
        Assert.Equal(
            [SearchPageLayout.BlockKind.Movies, SearchPageLayout.BlockKind.Series, SearchPageLayout.BlockKind.People, SearchPageLayout.BlockKind.Studios, SearchPageLayout.BlockKind.Theme],
            SearchPageLayout.Blocks(results));
        var sections = SearchPageLayout.SectionsOf(results);
        Assert.True(sections.Movies.HasMore);
        Assert.False(sections.Series.HasMore);
        Assert.Equal(["network-49", "studio-3268"], sections.StudiosAndNetworks.Results.Select(company => company.StableId));
        Assert.True(sections.StudiosAndNetworks.Results[0].IsNetwork);
        Assert.Null(sections.StudiosAndNetworks.Results[0].Favorited);
        Assert.Equal("Acting · Forrest Gump, Cast Away", sections.People.Results[0].KnownForLine);
    }

    [Fact]
    public void AThemeTheQueryNamesLeads()
    {
        var results = Json.Decode<SearchResults>(NewServer("first"));
        Assert.Equal(SearchPageLayout.BlockKind.Theme, SearchPageLayout.Blocks(results)[0]);
        Assert.True(results.Theme!.LeadsPage);
    }

    [Fact]
    public void AnOlderServerStillGetsTheNewOrder()
    {
        // Before 0.55: no sections, no placement, people/studios/titles only.
        var older = Json.Decode<SearchResults>($$"""
            {
              "query": "keanu",
              "people": [{ "tmdbId": 6384, "name": "Keanu Reeves", "profilePath": null, "knownForDepartment": "Acting", "favorited": false }],
              "studios": [{ "tmdbId": 420, "name": "Marvel Studios", "logoPath": null, "favorited": false }],
              "titles": [{{Card(2, "tv")}}, {{Card(1, "movie")}}],
              "theme": { "label": "Science Fiction", "items": [{{Card(3, "movie")}}] }
            }
            """);
        Assert.Null(older.Sections);
        Assert.Null(older.People[0].KnownFor);
        Assert.Equal("Acting", older.People[0].KnownForLine);
        Assert.Equal(
            [SearchPageLayout.BlockKind.Movies, SearchPageLayout.BlockKind.Series, SearchPageLayout.BlockKind.People, SearchPageLayout.BlockKind.Studios, SearchPageLayout.BlockKind.Theme],
            SearchPageLayout.Blocks(older));
        var sections = SearchPageLayout.SectionsOf(older);
        Assert.Equal(1, Assert.Single(sections.Movies.Results).TmdbId);
        Assert.Equal(2, Assert.Single(sections.Series.Results).TmdbId);
        Assert.False(sections.Movies.HasMore);
        Assert.False(Assert.Single(sections.StudiosAndNetworks.Results).IsNetwork);
    }

    [Fact]
    public void EmptySectionsAreLeftOut()
    {
        var empty = Json.Decode<SearchResults>("""
            {"query":"zzz","people":[],"studios":[],"titles":[],"theme":null,"sections":{
              "movies":{"totalResults":0,"totalPages":0,"results":[]},
              "series":{"totalResults":0,"totalPages":0,"results":[]},
              "people":{"totalResults":0,"totalPages":0,"results":[]},
              "studiosAndNetworks":{"totalResults":0,"totalPages":1,"results":[]}}}
            """);
        Assert.True(empty.IsEmpty);
        Assert.Empty(SearchPageLayout.Blocks(empty));
    }

    private static SearchSuggestion Suggestion(int id, string kind) =>
        Json.Decode<SearchSuggestion>($$"""{"id":{{id}},"mediaType":"{{kind}}","name":"N{{id}}","posterPath":null,"subtitle":null}""");

    [Fact]
    public void SuggestionsGroupInThePagesOrder()
    {
        var arranged = SuggestionGroups.Arrange([
            Suggestion(1, "movie"), Suggestion(2, "movie"), Suggestion(3, "tv"),
            Suggestion(4, "person"), Suggestion(5, "network"), Suggestion(6, "company"),
        ]);
        Assert.Equal([1, 2, 3, 4, 5, 6], arranged.Select(entry => entry.Suggestion.Id));
        Assert.Equal(
            [SuggestionGroup.Movies, SuggestionGroup.Movies, SuggestionGroup.Series, SuggestionGroup.People, SuggestionGroup.Studios, SuggestionGroup.Studios],
            arranged.Select(entry => entry.Group));
        Assert.Equal([true, false, true, true, true, false], arranged.Select(entry => entry.StartsGroup));
    }

    [Fact]
    public void GroupsKeepTheServersOrderAndGatherStrays()
    {
        // People first ("tom hanks"); an older server's mixed order gathers
        // each kind into its group where that group first appears.
        var arranged = SuggestionGroups.Arrange([Suggestion(1, "person"), Suggestion(2, "movie"), Suggestion(3, "tv"), Suggestion(4, "movie")]);
        Assert.Equal([1, 2, 4, 3], arranged.Select(entry => entry.Suggestion.Id));
        Assert.Equal([true, true, false, true], arranged.Select(entry => entry.StartsGroup));
    }

    [Fact]
    public void TheServersOrderPutsPeopleFirst()
    {
        var results = Json.Decode<SearchResults>(NewServer("last")) with
        {
            Order = ["people", "movies", "series", "studiosAndNetworks", "theme", "collections"],
        };
        Assert.Equal(
            [SearchPageLayout.BlockKind.People, SearchPageLayout.BlockKind.Movies, SearchPageLayout.BlockKind.Series, SearchPageLayout.BlockKind.Studios, SearchPageLayout.BlockKind.Theme],
            SearchPageLayout.Blocks(results));
        Assert.True(results.PeopleFirst);
        Assert.False(Json.Decode<SearchResults>(NewServer("last")).PeopleFirst);
    }

    [Fact]
    public void UnknownSuggestionKindsDecodeAndAreSkipped()
    {
        var unknown = Suggestion(1, "collection");
        Assert.False(unknown.MediaType.IsKnown);
        Assert.Null(unknown.MediaType.Group);
        var studio = Suggestion(2, "company");
        Assert.True(studio.MediaType.IsKnown);
        Assert.Null(studio.TitleId);
        Assert.Equal(SuggestionGroup.Studios, studio.MediaType.Group);
        Assert.Equal(2, Assert.Single(SuggestionGroups.Arrange([unknown, studio])).Suggestion.Id);
    }

    [Fact]
    public void SeeAllPathsAndPages()
    {
        Assert.Equal("/search/movies", SearchEndpoints.SectionPath(SearchSectionName.Movies));
        Assert.Equal("/search/series", SearchEndpoints.SectionPath(SearchSectionName.Series));
        Assert.Equal("/search/people", SearchEndpoints.SectionPath(SearchSectionName.People));
        Assert.Equal("/search/studios", SearchEndpoints.SectionPath(SearchSectionName.Studios));
        var studios = Json.Decode<Paginated<SearchCompanyCard>>(
            """{"page":1,"totalPages":2,"totalResults":30,"results":[{"kind":"network","tmdbId":49,"name":"HBO","logoPath":null,"favorited":null}]}""");
        Assert.True(studios.HasMorePages);
        Assert.True(studios.Results[0].IsNetwork);
        var people = Json.Decode<Paginated<PersonCard>>($$"""{"page":1,"totalPages":1,"totalResults":1,"results":[{{Person}}]}""");
        Assert.Equal(["Forrest Gump", "Cast Away"], people.Results[0].KnownFor!);
    }
}
