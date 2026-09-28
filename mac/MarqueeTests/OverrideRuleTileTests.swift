import Testing
@testable import Marquee

/// Settings › Services › Override rules: a tile names its genres, like the
/// website's (components/override-rules-card.tsx).
struct OverrideRuleTileTests {
    private let names = [28: "Action", 35: "Comedy", 18: "Drama", 27: "Horror", 16: "Animation"]

    private func rule(_ genres: [Int]) -> API.OverrideRule {
        var rule = API.OverrideRule.blank(serverId: "s1")
        rule.genres = genres
        return rule
    }

    @Test func namesTheGenres() {
        #expect(rule([]).genreLabels(names: names) == [])
        #expect(rule([16, 35]).genreLabels(names: names) == ["Animation", "Comedy"])
        // Four fit; a "+1 more" would take the same room as the name.
        #expect(rule([28, 35, 18, 27]).genreLabels(names: names) == ["Action", "Comedy", "Drama", "Horror"])
        #expect(rule([28, 35, 18, 27, 16]).genreLabels(names: names) == ["Action", "Comedy", "Drama", "+2 more"])
        // A genre TMDb no longer lists keeps its id, like the website.
        #expect(rule([28, 10770]).genreLabels(names: names) == ["Action", "#10770"])
    }

    @Test func withoutNamesTheTileCountsThem() {
        #expect(rule([28]).genreLabels(names: [:]) == nil)
    }
}
