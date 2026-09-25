using Marquee.Core.Api;
using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 15 example decoded as the Mac's APIFixtureTests decodes it
// (help.entry(for:) in testSettingsShapes).

public sealed class HelpFixtureTests
{
    [Fact]
    public void ErrorReferenceDecodes()
    {
        var categories = Fixtures.Decode<ListResponse<ErrorReferenceCategory>>("help-errors").Results;
        var category = Assert.Single(categories);

        Assert.Equal("Adding titles to Sonarr / Radarr", category.Title);
        var entry = Assert.Single(category.Entries);
        Assert.Equal("Connect Sonarr in Settings first.", entry.Message);
        Assert.Equal("No Sonarr connection is saved, or it's missing a root folder / quality profile.", entry.Meaning);
        Assert.StartsWith("Go to Settings", entry.WhatToDo, StringComparison.Ordinal);
    }

    [Fact]
    public void EntryForFindsTheMessageTheAppShowed()
    {
        var categories = Fixtures.Decode<ListResponse<ErrorReferenceCategory>>("help-errors").Results;

        // The reference is keyed on the exact text an ApiException carries.
        var shown = ApiException.Conflict("Connect Sonarr in Settings first.");
        var entry = categories.EntryFor(shown.Message);
        Assert.NotNull(entry);
        Assert.Equal("Connect Sonarr in Settings first.", entry.Message);

        Assert.Null(categories.EntryFor("Connect Radarr in Settings first."));
        Assert.Null(Array.Empty<ErrorReferenceCategory>().EntryFor("Connect Sonarr in Settings first."));
    }
}
