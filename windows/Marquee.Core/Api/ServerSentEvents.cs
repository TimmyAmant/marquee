using System.Globalization;
using System.Text;

namespace Marquee.Core.Api;

// Server-Sent Events (https://html.spec.whatwg.org/multipage/server-sent-events.html),
// the wire format of GET /notifications/stream (api-v1.md section 8).

/// <summary>One dispatched event: its type (<c>message</c> when the stream named none), its data, and the last event id seen.</summary>
public sealed record ServerSentEvent(string Type, string Data, string? Id);

/// <summary>
/// Turns the lines of an event stream into events, following the spec's
/// "interpret the stream" rules: <c>event</c>, <c>data</c> (several lines
/// joined with <c>\n</c>), <c>id</c> and <c>retry</c> fields, one optional
/// space after the colon, comments (<c>: keep-alive</c>) and unknown fields
/// ignored, and a blank line ending the event. A block without any
/// <c>data</c> line dispatches nothing.
///
/// Fed one line at a time, without its terminator (a
/// <see cref="StreamReader"/> splits on CRLF, LF and CR, as the spec does);
/// <see cref="FeedText"/> does the splitting for text that is already whole.
/// </summary>
public sealed class ServerSentEventParser
{
    private readonly StringBuilder data = new();
    private string eventType = "";

    /// <summary>The last <c>id</c> field; it carries over to later events, per the spec.</summary>
    public string? LastEventId { get; private set; }

    /// <summary>The last <c>retry</c> field, in milliseconds: how long to wait before reconnecting.</summary>
    public int? RetryMilliseconds { get; private set; }

    /// <summary>Takes one line; answers the event it completed, if it was the blank line ending one.</summary>
    public ServerSentEvent? Feed(string line)
    {
        if (line.Length == 0)
        {
            return Dispatch();
        }
        if (line[0] == ':')
        {
            // A comment: the server's keep-alive.
            return null;
        }

        string field;
        string value;
        var colon = line.IndexOf(':');
        if (colon < 0)
        {
            field = line;
            value = "";
        }
        else
        {
            field = line[..colon];
            value = line[(colon + 1)..];
            if (value.StartsWith(' '))
            {
                value = value[1..];
            }
        }

        switch (field)
        {
            case "event":
                eventType = value;
                break;
            case "data":
                data.Append(value).Append('\n');
                break;
            case "id":
                if (!value.Contains('\0'))
                {
                    LastEventId = value;
                }
                break;
            case "retry":
                if (value.Length > 0
                    && value.All(char.IsAsciiDigit)
                    && int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var milliseconds))
                {
                    RetryMilliseconds = milliseconds;
                }
                break;
        }
        return null;
    }

    /// <summary>
    /// Feeds every complete line of <paramref name="text"/> (terminated by
    /// CRLF, LF or CR) and answers the events they completed. A last line
    /// without a terminator is left out, as a stream that ended there would.
    /// </summary>
    public IReadOnlyList<ServerSentEvent> FeedText(string text)
    {
        var events = new List<ServerSentEvent>();
        var start = 0;
        for (var index = 0; index < text.Length; index++)
        {
            var character = text[index];
            if (character is not ('\r' or '\n'))
            {
                continue;
            }
            if (Feed(text[start..index]) is { } completed)
            {
                events.Add(completed);
            }
            if (character == '\r' && index + 1 < text.Length && text[index + 1] == '\n')
            {
                index++;
            }
            start = index + 1;
        }
        return events;
    }

    private ServerSentEvent? Dispatch()
    {
        if (data.Length == 0)
        {
            eventType = "";
            return null;
        }
        // Every data line appended a "\n"; the last one isn't part of the data.
        var text = data.ToString(0, data.Length - 1);
        var dispatched = new ServerSentEvent(eventType.Length > 0 ? eventType : "message", text, LastEventId);
        data.Clear();
        eventType = "";
        return dispatched;
    }
}
