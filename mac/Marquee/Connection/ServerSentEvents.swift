import Foundation

/// One event from a `text/event-stream` response (`GET /notifications/stream`:
/// `ready`, `notification`, `signed-out`).
struct ServerSentEvent: Equatable, Sendable {
    /// The `event:` field; "message" when the server didn't name one.
    var name: String
    /// The `data:` lines, joined with newlines.
    var data: String
    /// The `id:` field (a notification's id).
    var id: String?
}

/// Splits a byte stream into lines, however they end (`\n`, `\r\n` or `\r`),
/// keeping the empty ones: an empty line is what ends an event.
/// (`AsyncBytes.lines` skips empty lines, so it can't be used for this.)
struct ServerSentEventLineSplitter {
    private var buffer: [UInt8] = []
    private var afterCarriageReturn = false

    private static let lineFeed: UInt8 = 0x0A
    private static let carriageReturn: UInt8 = 0x0D

    /// A complete line (without its ending) once `byte` finishes one.
    mutating func feed(_ byte: UInt8) -> String? {
        if byte == Self.lineFeed, afterCarriageReturn {
            // The \n of a \r\n: the line already ended at the \r.
            afterCarriageReturn = false
            return nil
        }
        afterCarriageReturn = byte == Self.carriageReturn
        guard byte == Self.lineFeed || byte == Self.carriageReturn else {
            buffer.append(byte)
            return nil
        }
        defer { buffer.removeAll(keepingCapacity: true) }
        return String(decoding: buffer, as: UTF8.self)
    }
}

/// The event-stream format, as the HTML standard's "interpret an event
/// stream" section describes it, for what Marquee's server sends.
struct ServerSentEventParser {
    private var name = ""
    private var dataLines: [String] = []
    private var id: String?

    /// The last `retry:` the server sent: how long to wait before reconnecting.
    private(set) var reconnectionTime: Duration?

    /// Feeds one line; returns an event when the line ends one.
    mutating func consume(_ line: String) -> ServerSentEvent? {
        if line.isEmpty { return dispatch() }
        // `: keep-alive` and any other comment.
        if line.hasPrefix(":") { return nil }

        let field: Substring
        var value: Substring
        if let colon = line.firstIndex(of: ":") {
            field = line[..<colon]
            value = line[line.index(after: colon)...]
            if value.hasPrefix(" ") { value = value.dropFirst() }
        } else {
            field = Substring(line)
            value = ""
        }

        switch field {
        case "event":
            name = String(value)
        case "data":
            dataLines.append(String(value))
        case "id":
            if !value.contains("\0") { id = String(value) }
        case "retry":
            if let milliseconds = Int(value), milliseconds >= 0 {
                reconnectionTime = .milliseconds(milliseconds)
            }
        default:
            break
        }
        return nil
    }

    private mutating func dispatch() -> ServerSentEvent? {
        defer {
            name = ""
            dataLines = []
            id = nil
        }
        // A block with no data (just `retry:`, say) isn't an event.
        guard !dataLines.isEmpty else { return nil }
        return ServerSentEvent(name: name.isEmpty ? "message" : name, data: dataLines.joined(separator: "\n"), id: id)
    }
}
