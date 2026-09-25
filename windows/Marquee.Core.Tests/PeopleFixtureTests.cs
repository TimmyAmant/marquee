using Marquee.Core.Models;
using Marquee.Core.Tests.Support;

namespace Marquee.Core.Tests;

// The section 5 examples (person-detail, company-detail) and the card
// shapes they are built from, decoded as the Mac's APIFixtureTests decodes
// them, plus the client-side list order the person/studio pages offer.

public sealed class PeopleFixtureTests
{
    [Fact]
    public void PersonDetailDecodes()
    {
        var person = Fixtures.Decode<PersonDetail>("person-detail");

        Assert.Equal(6384, person.TmdbId);
        Assert.Equal(6384, person.Id);
        Assert.Equal("Keanu Reeves", person.Name);
        Assert.Equal(["Keanu Charles Reeves"], person.AlsoKnownAs);
        Assert.StartsWith("Keanu Charles Reeves is a Canadian actor", person.Biography);
        Assert.Equal(new DateOnly(1964, 9, 2), person.Birthday);
        Assert.Equal("1964-09-02", Json.FormatCalendarDate(person.Birthday!.Value));
        Assert.Null(person.Deathday);
        Assert.Equal("Beirut, Lebanon", person.PlaceOfBirth);
        Assert.Equal("https://image.tmdb.org/t/p/w185/8RZLOyYGsoRe9p44q3xin9QkMHv.jpg", person.ProfilePath.Url(ImageSize.W185)?.AbsoluteUri);
        Assert.True(person.Favorited);
        Assert.NotNull(person.Age);

        var credit = Assert.Single(person.Credits);
        Assert.Equal(MediaType.Movie, credit.MediaType);
        Assert.Equal(1638103, credit.TmdbId);
        Assert.Equal("Constantine 2", credit.Name);
        Assert.Equal("John Constantine", credit.Subtitle);
        Assert.Null(credit.Year);
        Assert.Null(credit.Status);
        Assert.False(credit.CanQuickAdd);
    }

    [Fact]
    public void AgeCountsWholeYears()
    {
        var person = Fixtures.Decode<PersonDetail>("person-detail");

        Assert.Equal(62, person.AgeOn(new DateOnly(2026, 9, 25)));
        // The day before the birthday is still the previous year.
        Assert.Equal(61, person.AgeOn(new DateOnly(2026, 9, 1)));
        Assert.Equal(62, person.AgeOn(new DateOnly(2026, 9, 2)));

        var deceased = person with { Deathday = new DateOnly(2000, 1, 1) };
        Assert.Equal(35, deceased.AgeOn(new DateOnly(2026, 9, 25)));

        var unknown = person with { Birthday = null };
        Assert.Null(unknown.Age);
        Assert.Null(unknown.AgeOn(new DateOnly(2026, 9, 25)));
    }

    [Fact]
    public void BlankBirthdayReadsAsNull()
    {
        // TMDb sends "" for an unknown date; one must not fail the page.
        var json = Fixtures.Read("person-detail").Replace("\"1964-09-02\"", "\"\"", StringComparison.Ordinal);
        var person = Json.Decode<PersonDetail>(json);
        Assert.Null(person.Birthday);
        Assert.Null(person.Age);
    }

    [Fact]
    public void CompanyDetailDecodes()
    {
        var company = Fixtures.Decode<CompanyDetail>("company-detail");

        Assert.Equal(420, company.TmdbId);
        Assert.Equal(420, company.Id);
        Assert.Equal("Marvel Studios", company.Name);
        Assert.Null(company.Description);
        Assert.Null(company.ShortDescription);
        Assert.Equal("https://image.tmdb.org/t/p/w300/hUzeosd33nzE5MCNsZxCGEKTXaQ.png", company.LogoPath.Url(ImageSize.W300)?.AbsoluteUri);
        Assert.Equal(137, company.TitleCount);
        Assert.False(company.Favorited);

        var title = Assert.Single(company.Titles);
        Assert.Equal("The Matrix", title.Name);
        Assert.Equal("1999", title.Year);
        Assert.Null(title.Subtitle);
    }

    [Fact]
    public void ShortDescriptionTruncatesAt400Characters()
    {
        var company = Fixtures.Decode<CompanyDetail>("company-detail");

        var brief = company with { Description = "A studio." };
        Assert.Equal("A studio.", brief.ShortDescription);

        var blank = company with { Description = "   " };
        Assert.Null(blank.ShortDescription);

        var exact = company with { Description = new string('x', 400) };
        Assert.Equal(400, exact.ShortDescription!.Length);
        Assert.DoesNotContain("…", exact.ShortDescription);

        var text = string.Concat(Enumerable.Repeat("word ", 100)) + "tail";
        var truncated = (company with { Description = text }).ShortDescription!;
        // 400 characters, the trailing space trimmed, then the ellipsis.
        Assert.EndsWith("…", truncated);
        Assert.Equal(text[..400].TrimEnd() + "…", truncated);
    }

    [Fact]
    public void CardFixturesDecode()
    {
        var person = Fixtures.Decode<PersonCard>("person-card");
        Assert.Equal(6384, person.TmdbId);
        Assert.Equal("Keanu Reeves", person.Name);
        Assert.Equal("Acting", person.KnownForDepartment);
        Assert.False(person.Favorited);
        Assert.Equal("https://image.tmdb.org/t/p/w185/8RZL.jpg", person.ProfilePath.Url(ImageSize.W185)?.AbsoluteUri);

        var company = Fixtures.Decode<CompanyCard>("company-card");
        Assert.Equal(420, company.TmdbId);
        Assert.Equal("Marvel Studios", company.Name);
        Assert.False(company.Favorited);
        Assert.NotNull(company.LogoPath);

        var network = Fixtures.Decode<NetworkCard>("network-card");
        Assert.Equal(213, network.TmdbId);
        Assert.Equal("Netflix", network.Name);
        Assert.Equal("/wwem.png", network.LogoPath?.Path);
    }

    // MARK: List order

    private static TitleCard Card(string name, string? year)
    {
        var yearJson = year == null ? "null" : $"\"{year}\"";
        return Json.Decode<TitleCard>($$"""
            {"mediaType":"movie","tmdbId":{{name.GetHashCode(StringComparison.Ordinal) & 0x7fffffff}},"name":"{{name}}","posterPath":null,
             "year":{{yearJson}},"subtitle":null,"overview":null,"rating":null,"status":null,
             "favorited":null,"requested":null,"canQuickAdd":false,"canRequest":false}
            """);
    }

    [Fact]
    public void ListOrderMatchesTheWebsite()
    {
        // The Mac's testBadgeLabelsAndListOrder: unknown years last, equal
        // keys in their original order, A-Z by name.
        var cards = new[] { Card("b", "2001"), Card("a", null), Card("c", "2010"), Card("d", "2001") };

        Assert.Equal(["c", "b", "d", "a"], cards.SortedBy(TitleListOrder.NewestFirst).Select(card => card.Name));
        Assert.Equal(["b", "d", "c", "a"], cards.SortedBy(TitleListOrder.OldestFirst).Select(card => card.Name));
        Assert.Equal(["a", "b", "c", "d"], cards.SortedBy(TitleListOrder.Alphabetical).Select(card => card.Name));
    }

    [Fact]
    public void AlphabeticalIgnoresCase()
    {
        var cards = new[] { Card("banana", "2001"), Card("Apple", "2001"), Card("cherry", null) };
        Assert.Equal(["Apple", "banana", "cherry"], cards.SortedBy(TitleListOrder.Alphabetical).Select(card => card.Name));
    }

    [Fact]
    public void ListOrderLabels()
    {
        Assert.Equal(["Newest first", "Oldest first", "A–Z"], TitleListOrderExtensions.All.Select(order => order.Label()));
        Assert.Equal(TitleListOrder.NewestFirst, TitleListOrderExtensions.All[0]);
    }
}
