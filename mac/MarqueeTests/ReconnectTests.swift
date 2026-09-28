import Testing
import Foundation
@testable import Marquee

/// "Waiting for your server to come back…": the backoff, and the saved
/// server restarting under the app.
struct ReconnectScheduleTests {
    @Test func startsQuickThenSettlesEveryFiveSeconds() {
        let schedule = ReconnectSchedule.standard
        #expect(schedule.delay(beforeAttempt: 0, elapsed: .zero) == .seconds(2))
        #expect(schedule.delay(beforeAttempt: 1, elapsed: .seconds(2)) == .seconds(3))
        #expect(schedule.delay(beforeAttempt: 2, elapsed: .seconds(5)) == .seconds(5))
        #expect(schedule.delay(beforeAttempt: 3, elapsed: .seconds(10)) == .seconds(5))
        #expect(schedule.delay(beforeAttempt: 20, elapsed: .seconds(100)) == .seconds(5))
    }

    @Test func givesUpAfterAboutTwoMinutes() {
        let schedule = ReconnectSchedule.standard
        #expect(schedule.delay(beforeAttempt: 24, elapsed: .seconds(115)) == .seconds(5))
        #expect(schedule.delay(beforeAttempt: 25, elapsed: .seconds(116)) == nil)
        #expect(schedule.delay(beforeAttempt: 0, elapsed: .seconds(119)) == nil, "Even an early attempt stops at the limit")
    }

    @Test func attemptsFitTheWindow() {
        // Pretend every attempt fails instantly: count how many the standard
        // schedule makes before it hands over to the can't-reach card.
        let schedule = ReconnectSchedule.standard
        var elapsed = Duration.zero
        var attempts = 0
        while let wait = schedule.delay(beforeAttempt: attempts, elapsed: elapsed) {
            elapsed += wait
            attempts += 1
        }
        #expect(attempts == 25)
        #expect(elapsed == .seconds(120))
    }
}

/// The app side, with a probe the test answers for and a schedule in
/// milliseconds. Nothing here touches the real session on this Mac.
@MainActor
struct ReconnectStateTests {
    /// Answers the probe from a script: the first `down` probes see `outage`,
    /// then the server is back.
    final class ScriptedServer: @unchecked Sendable {
        private let lock = NSLock()
        private var calls = 0
        let down: Int
        let outage: ProbeOutcome

        init(down: Int, outage: ProbeOutcome = .unreachable(.refused)) {
            self.down = down
            self.outage = outage
        }

        var probes: Int { lock.withLock { calls } }

        func probe() -> ProbeOutcome {
            let call = lock.withLock { calls += 1; return calls }
            return call <= down ? outage : .marquee(ServerInfo(version: "0.61.0", setupComplete: true))
        }
    }

    private static let fast = ReconnectSchedule(steps: [.milliseconds(20)], interval: .milliseconds(20), limit: .milliseconds(400))

    private func makeModel(_ server: ScriptedServer, token: Bool = false) -> (AppModel, InMemoryTokenStore) {
        let suite = UserDefaults(suiteName: "marquee.tests.reconnect.\(UUID().uuidString)")!
        // Port 9 on loopback: nothing listens, so a saved token's /me is refused.
        let address = ServerAddress(host: "127.0.0.1", port: 9)
        suite.set(address.baseURLString, forKey: ServerSession.serverDefaultsKey)
        let store = InMemoryTokenStore()
        if token { store.save("mqt_saved", for: address.baseURLString) }
        let session = ServerSession(defaults: suite, tokenStore: store, pinned: nil, probe: { _ in server.probe() })
        let model = AppModel(session: session)
        model.reconnectSchedule = Self.fast
        return (model, store)
    }

    private func waitFor(_ phase: AppModel.Phase, in model: AppModel, timeout: Duration = .seconds(5)) async -> Bool {
        let deadline = ContinuousClock.now + timeout
        while ContinuousClock.now < deadline {
            if model.phase == phase { return true }
            try? await Task.sleep(for: .milliseconds(5))
        }
        return model.phase == phase
    }

    @Test func aRestartingServerWaitsThenComesBackOnItsOwn() async {
        let server = ScriptedServer(down: 3)
        let (model, _) = makeModel(server)
        await model.connectToSavedServer()
        #expect(model.phase == .waiting)
        #expect(model.connectionProblem == .unreachable(.refused))

        #expect(await waitFor(.signIn, in: model))
        #expect(server.probes == 4)
        #expect(model.connectionProblem == nil)
    }

    @Test func aProxyBadGatewayIsWaitedOutToo() async {
        let server = ScriptedServer(down: 1, outage: .unreachable(.serverError(502)))
        let (model, _) = makeModel(server)
        await model.connectToSavedServer()
        #expect(model.phase == .waiting)
        #expect(await waitFor(.signIn, in: model))
    }

    @Test func aLongOutageFallsBackToTheCardAndKeepsTheToken() async {
        let server = ScriptedServer(down: .max)
        let (model, store) = makeModel(server, token: true)
        await model.connectToSavedServer()
        #expect(model.phase == .waiting)
        #expect(await waitFor(.unreachable, in: model))
        let attempts = server.probes
        #expect(attempts > 3)
        #expect(store.token(for: "http://127.0.0.1:9") == "mqt_saved", "Waiting never signs out")
        #expect(model.session.hasToken)

        // No more automatic attempts once the card is up; a Retry that
        // fails stays on the card rather than starting another wait.
        try? await Task.sleep(for: .milliseconds(100))
        #expect(server.probes == attempts)
        model.retryConnection()
        try? await Task.sleep(for: .milliseconds(100))
        #expect(model.phase == .unreachable)
        #expect(server.probes == attempts + 1)
    }

    @Test func otherProblemsGoStraightToTheCard() async {
        let server = ScriptedServer(down: .max, outage: .notMarquee)
        let (model, _) = makeModel(server)
        await model.connectToSavedServer()
        #expect(model.phase == .unreachable)
        try? await Task.sleep(for: .milliseconds(100))
        #expect(server.probes == 1, "No automatic retries for a problem that won't clear by itself")
    }

    @Test func retryNowAndActivationTryImmediately() async {
        let server = ScriptedServer(down: 1)
        let (model, _) = makeModel(server)
        model.reconnectSchedule = ReconnectSchedule(steps: [], interval: .seconds(60), limit: .seconds(120))
        await model.connectToSavedServer()
        #expect(model.phase == .waiting)
        model.applicationDidBecomeActive()
        #expect(await waitFor(.signIn, in: model, timeout: .seconds(2)))
        #expect(server.probes == 2)
    }

    @Test func changeServerStopsWaiting() async {
        let server = ScriptedServer(down: .max)
        let (model, _) = makeModel(server)
        await model.connectToSavedServer()
        #expect(model.phase == .waiting)
        model.changeServer()
        #expect(model.phase == .connect)
        let probes = server.probes
        try? await Task.sleep(for: .milliseconds(100))
        #expect(server.probes == probes)
        #expect(model.phase == .connect)
    }
}
