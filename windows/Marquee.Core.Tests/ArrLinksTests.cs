using System.Text.Json.Nodes;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// "Open in Radarr / Sonarr" (0.63+): viewer.arrLinks from the doc's example
// and from an older server that leaves it out, and the buttons' labels (the
// Mac's ArrLinksTests).

public sealed class ArrLinksTests
{
    private static TitleDetail WithLinks(JsonNode? links)
    {
        var json = JsonNode.Parse(Fixtures.Read("title-detail"))!.AsObject();
        var viewer = json["viewer"]!.AsObject();
        viewer.Remove("arrLinks");
        if (links != null)
        {
            viewer["arrLinks"] = links;
        }
        return Json.Decode<TitleDetail>(json.ToJsonString());
    }

    private static JsonObject Link(string kind, string name, bool is4k = false) => new()
    {
        ["kind"] = kind,
        ["serverName"] = name,
        ["is4k"] = is4k,
        ["url"] = $"http://{name.ToLowerInvariant().Replace(' ', '-')}:7878/x",
    };

    [Fact]
    public void TheFixtureDecodesTheLink()
    {
        var detail = Fixtures.Decode<TitleDetail>("title-detail");
        var link = Assert.Single(detail.Viewer.ArrLinks);
        Assert.Equal(ArrProvider.Radarr, link.Kind);
        Assert.Equal("Radarr", link.ServerName);
        Assert.False(link.Is4k);
        Assert.Equal("https://radarr.example.com/movie/603", link.Url);
        Assert.Equal(["Open in Radarr"], detail.Viewer.OpenInArrLinks.Select(item => item.Title));
    }

    [Fact]
    public void AnOlderServerOrAMemberGetsNoButtons()
    {
        Assert.Empty(WithLinks(null).Viewer.OpenInArrLinks);
        Assert.Empty(WithLinks(new JsonArray()).Viewer.OpenInArrLinks);
    }

    [Fact]
    public void TheServersNameOnlyWhenThereAreSeveral()
    {
        var one = WithLinks(new JsonArray(Link("radarr", "Movies"), Link("radarr", "Movies UHD", is4k: true)));
        Assert.Equal(["Open in Radarr", "Open in Radarr 4K"], one.Viewer.OpenInArrLinks.Select(item => item.Title));

        var several = WithLinks(new JsonArray(Link("sonarr", "Sonarr"), Link("sonarr", "Anime"), Link("sonarr", "4K Sonarr", is4k: true)));
        Assert.Equal(["Open in Sonarr", "Open in Anime", "Open in Sonarr 4K"], several.Viewer.OpenInArrLinks.Select(item => item.Title));
    }

    [Fact]
    public void AServersPublicUrlDecodes()
    {
        var server = Fixtures.Decode<ListResponse<ArrServer>>("arr-servers").Results[0];
        Assert.Null(server.PublicUrl);
        var json = JsonNode.Parse(Fixtures.Read("arr-servers"))!["results"]![0]!.AsObject();
        json["publicUrl"] = "https://sonarr.example.com";
        Assert.Equal("https://sonarr.example.com", Json.Decode<ArrServer>(json.ToJsonString()).PublicUrl);
    }
}
