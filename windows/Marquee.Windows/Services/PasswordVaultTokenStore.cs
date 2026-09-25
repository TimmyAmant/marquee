using System.Diagnostics;
using Marquee.Core.Connection;
using Windows.Security.Credentials;

namespace Marquee.Windows.Services;

/// <summary>
/// Bearer tokens in the Windows credential store (<c>PasswordVault</c>, the
/// vault behind Credential Manager), one entry per server: the resource is
/// fixed and the user name is the server's base URL, so a token never gets
/// sent to a different server than the one that issued it.
///
/// The vault is the counterpart of the Mac app's login Keychain: encrypted
/// per Windows account, not in any file the app owns. The token itself is
/// never logged; a failure message only says that a read or write failed.
/// </summary>
public sealed class PasswordVaultTokenStore : ITokenStore
{
    public const string Resource = "Marquee server session";

    /// <summary>ERROR_NOT_FOUND as an HRESULT: how the vault says "no such credential".</summary>
    private const int ElementNotFound = unchecked((int)0x80070490);

    public TokenLookup Lookup(string server)
    {
        try
        {
            var credential = new PasswordVault().Retrieve(Resource, server);
            // Retrieve returns the entry without its secret; the password is a second read.
            credential.RetrievePassword();
            return string.IsNullOrWhiteSpace(credential.Password) ? TokenLookup.Missing : TokenLookup.Found(credential.Password);
        }
        catch (Exception error) when (error.HResult == ElementNotFound)
        {
            return TokenLookup.Missing;
        }
        catch (Exception error)
        {
            // Anything else (the vault service is down, a corrupt entry) is
            // not a sign-out: the session shows a retry rather than a password
            // prompt. The vault reports through COMException with assorted
            // HRESULTs, so the catch has to be this broad.
            Debug.WriteLine($"Credential store unavailable: {error.GetType().Name}");
            return TokenLookup.Unavailable;
        }
    }

    public bool Save(string token, string server)
    {
        try
        {
            var vault = new PasswordVault();
            // Add() with the same resource and user name replaces the entry,
            // but removing first makes the outcome independent of that detail.
            RemoveExisting(vault, server);
            vault.Add(new PasswordCredential(Resource, server, token));
            return true;
        }
        catch (Exception error)
        {
            Debug.WriteLine($"Credential store refused the write: {error.GetType().Name}");
            return false;
        }
    }

    public void Delete(string server)
    {
        try
        {
            RemoveExisting(new PasswordVault(), server);
        }
        catch (Exception error)
        {
            // A token that can't be deleted is revoked on the server anyway.
            Debug.WriteLine($"Credential store refused the delete: {error.GetType().Name}");
        }
    }

    private static void RemoveExisting(PasswordVault vault, string server)
    {
        try
        {
            vault.Remove(vault.Retrieve(Resource, server));
        }
        catch (Exception error) when (error.HResult == ElementNotFound)
        {
            // Nothing saved for this server.
        }
    }
}
