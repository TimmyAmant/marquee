namespace Marquee.Core.Models;

// The Error reference (api-v1.md section 15). Mirrors
// mac/Marquee/API/Models/HelpModels.swift.

/// <summary><c>GET /help/errors</c>: every user-facing error message, what it means and what to do, grouped by area.</summary>
public sealed record ErrorReferenceCategory
{
    /// <summary>One message on the reference page.</summary>
    public sealed record Entry
    {
        /// <summary>Exactly the text the app shows (an <c>ApiException</c>'s message), so it can be looked up.</summary>
        public required string Message { get; init; }

        public required string Meaning { get; init; }
        public required string WhatToDo { get; init; }
    }

    /// <summary>The area, e.g. "Adding titles to Sonarr / Radarr".</summary>
    public required string Title { get; init; }

    public required IReadOnlyList<Entry> Entries { get; init; }
}

public static class ErrorReferenceExtensions
{
    /// <summary>The reference entry for an error the app just showed, if there is one.</summary>
    public static ErrorReferenceCategory.Entry? EntryFor(this IEnumerable<ErrorReferenceCategory> categories, string message) =>
        categories.SelectMany(category => category.Entries).FirstOrDefault(entry => entry.Message == message);
}
