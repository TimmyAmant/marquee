using Marquee.Core.Api;

namespace Marquee.Core.Tests;

// The event-stream format of GET /notifications/stream, per the HTML spec's
// "interpret the stream" rules, starting with the doc's own example.

public sealed class ServerSentEventParserTests
{
    [Fact]
    public void ReadsTheDocsStream()
    {
        const string stream =
            "retry: 5000\n\n"
            + "event: ready\ndata: {}\n\n"
            + "event: notification\n"
            + "id: a23f7682-41ae-4e8a-8b17-14d903ab017a\n"
            + "data: {\"id\":\"a23f7682-41ae-4e8a-8b17-14d903ab017a\",\"title\":\"Inception\"}\n\n"
            + ": keep-alive\n\n"
            + "event: signed-out\ndata: {}\n\n";
        var parser = new ServerSentEventParser();

        var events = parser.FeedText(stream);

        Assert.Equal(["ready", "notification", "signed-out"], events.Select(message => message.Type));
        Assert.Equal("{}", events[0].Data);
        Assert.Null(events[0].Id);
        Assert.Equal("{\"id\":\"a23f7682-41ae-4e8a-8b17-14d903ab017a\",\"title\":\"Inception\"}", events[1].Data);
        Assert.Equal("a23f7682-41ae-4e8a-8b17-14d903ab017a", events[1].Id);
        Assert.Equal(5000, parser.RetryMilliseconds);
    }

    [Fact]
    public void AnEventWithoutATypeIsAMessage()
    {
        var events = new ServerSentEventParser().FeedText("data: hello\n\n");

        var message = Assert.Single(events);
        Assert.Equal("message", message.Type);
        Assert.Equal("hello", message.Data);
    }

    [Fact]
    public void SeveralDataLinesJoinWithNewlines()
    {
        var events = new ServerSentEventParser().FeedText("event: note\ndata: first\ndata:second\ndata\ndata:  indented\n\n");

        var message = Assert.Single(events);
        Assert.Equal("note", message.Type);
        // One space after the colon is dropped, a second one stays; a bare
        // "data" line is an empty line of data.
        Assert.Equal("first\nsecond\n\n indented", message.Data);
    }

    [Fact]
    public void CommentsAndUnknownFieldsAreIgnored()
    {
        var parser = new ServerSentEventParser();

        Assert.Null(parser.Feed(": keep-alive"));
        Assert.Null(parser.Feed(":"));
        Assert.Null(parser.Feed("colour: blue"));
        Assert.Null(parser.Feed("data: kept"));
        var message = parser.Feed("");

        Assert.NotNull(message);
        Assert.Equal("kept", message.Data);
    }

    [Fact]
    public void ABlockWithoutDataDispatchesNothingAndForgetsItsType()
    {
        var parser = new ServerSentEventParser();

        // "retry" alone, and an event name with no data, end without an event...
        Assert.Empty(parser.FeedText("retry: 3000\n\nevent: ready\n\n"));
        // ...and the name doesn't leak into the next event.
        var message = Assert.Single(parser.FeedText("data: x\n\n"));
        Assert.Equal("message", message.Type);
        Assert.Equal(3000, parser.RetryMilliseconds);
    }

    [Fact]
    public void TheIdCarriesOverToLaterEvents()
    {
        var parser = new ServerSentEventParser();

        var events = parser.FeedText("id: 1\ndata: a\n\ndata: b\n\nid\ndata: c\n\n");

        Assert.Equal(["1", "1", ""], events.Select(message => message.Id));
        Assert.Equal("", parser.LastEventId);
    }

    [Fact]
    public void AnIdWithANullCharacterIsIgnored()
    {
        var parser = new ServerSentEventParser();

        var message = Assert.Single(parser.FeedText("id: 7\n\nid: bad\0id\ndata: x\n\n"));

        Assert.Equal("7", message.Id);
    }

    [Fact]
    public void RetryTakesOnlyDigits()
    {
        var parser = new ServerSentEventParser();

        parser.FeedText("retry: 5000\n");
        parser.FeedText("retry: soon\n");
        parser.FeedText("retry: -1\n");
        parser.FeedText("retry: 12.5\n");

        Assert.Equal(5000, parser.RetryMilliseconds);
    }

    [Theory]
    [InlineData("\r\n")]
    [InlineData("\r")]
    [InlineData("\n")]
    public void AnyLineEndingWorks(string newline)
    {
        var text = string.Join(newline, "event: notification", "id: 42", "data: line one", "data: line two", "", ": keep-alive", "", "");

        var message = Assert.Single(new ServerSentEventParser().FeedText(text));

        Assert.Equal("notification", message.Type);
        Assert.Equal("line one\nline two", message.Data);
        Assert.Equal("42", message.Id);
    }

    [Fact]
    public void CrlfSplitAcrossFeedsIsOneLineEnding()
    {
        // A StreamReader hands over lines without their terminators, CRLF
        // included, so feeding line by line never sees a stray empty line.
        var parser = new ServerSentEventParser();
        using var reader = new StringReader("data: a\r\ndata: b\r\n\r\n");
        var events = new List<ServerSentEvent>();
        while (reader.ReadLine() is { } line)
        {
            if (parser.Feed(line) is { } message)
            {
                events.Add(message);
            }
        }

        var only = Assert.Single(events);
        Assert.Equal("a\nb", only.Data);
    }

    [Fact]
    public void AnUnfinishedEventAtTheEndIsDropped()
    {
        var parser = new ServerSentEventParser();

        Assert.Empty(parser.FeedText("event: notification\ndata: {}"));
        Assert.Empty(parser.FeedText("event: notification\ndata: {}\n"));
    }
}
