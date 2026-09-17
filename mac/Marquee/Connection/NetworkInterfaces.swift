import Foundation
import Darwin

/// An active IPv4 interface and its subnet.
struct IPv4Interface: Hashable, Sendable {
    let name: String
    /// Host byte order.
    let address: UInt32
    let netmask: UInt32

    var prefixLength: Int { netmask.nonzeroBitCount }
    var addressString: String { IPv4.string(address) }
    /// `192.168.1.0/24`
    var subnetDescription: String { "\(IPv4.string(address & netmask))/\(prefixLength)" }
    /// 169.254.0.0/16 (self-assigned, no DHCP).
    var isLinkLocal: Bool { address >> 16 == 0xA9FE }
}

/// Which addresses discovery scans.
enum NetworkInterfaces {
    /// Larger subnets fall back to the /24 around the Mac's own address:
    /// a /16 home network is almost always one busy /24 in practice.
    static let maxHostsPerInterface = 1024

    /// Up, running, non-loopback IPv4 interfaces from getifaddrs. Wi-Fi and
    /// Ethernet (`en*`) win when present, which leaves out VPN tunnels and
    /// virtual bridges whose "subnets" don't hold a home server.
    static func activeIPv4() -> [IPv4Interface] {
        var head: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&head) == 0, let first = head else { return [] }
        defer { freeifaddrs(head) }

        var interfaces: [IPv4Interface] = []
        for pointer in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let entry = pointer.pointee
            let flags = Int32(entry.ifa_flags)
            guard flags & IFF_UP != 0, flags & IFF_RUNNING != 0,
                  flags & IFF_LOOPBACK == 0, flags & IFF_POINTOPOINT == 0 else { continue }
            guard let socketAddress = entry.ifa_addr, socketAddress.pointee.sa_family == UInt8(AF_INET),
                  let maskAddress = entry.ifa_netmask else { continue }

            let address = socketAddress.withMemoryRebound(to: sockaddr_in.self, capacity: 1) {
                UInt32(bigEndian: $0.pointee.sin_addr.s_addr)
            }
            let netmask = maskAddress.withMemoryRebound(to: sockaddr_in.self, capacity: 1) {
                UInt32(bigEndian: $0.pointee.sin_addr.s_addr)
            }
            let interface = IPv4Interface(name: String(cString: entry.ifa_name), address: address, netmask: netmask)
            guard address != 0, !interface.isLinkLocal else { continue }
            interfaces.append(interface)
        }
        return preferred(interfaces)
    }

    static func preferred(_ interfaces: [IPv4Interface]) -> [IPv4Interface] {
        let usable = interfaces.filter { !$0.isLinkLocal && $0.address >> 24 != 127 }
        let ethernet = usable.filter { $0.name.hasPrefix("en") }
        var seen = Set<IPv4Interface>()
        return (ethernet.isEmpty ? usable : ethernet)
            .filter { seen.insert($0).inserted }
            .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    /// Every host address in the interface's subnet (network and broadcast
    /// excluded), or the /24 around its address when the subnet has more
    /// than `cap` hosts.
    static func scanHosts(for interface: IPv4Interface, cap: Int = maxHostsPerInterface) -> [UInt32] {
        let prefix = interface.prefixLength
        guard prefix < 32 else { return [] }

        var mask = interface.netmask
        if prefix == 31 {
            // RFC 3021 point-to-point pair: both addresses are hosts.
            let network = interface.address & mask
            return [network, network + 1].filter { $0 != interface.address }
        }
        let hostCount = (UInt64(1) << UInt64(32 - prefix)) - 2
        if hostCount > UInt64(cap) {
            mask = 0xFFFF_FF00
        }
        let network = interface.address & mask
        let broadcast = network | ~mask
        return Array((network + 1)..<broadcast)
    }

    /// The union across interfaces, in order, without repeats.
    static func scanHosts(for interfaces: [IPv4Interface], cap: Int = maxHostsPerInterface) -> [UInt32] {
        var seen = Set<UInt32>()
        return interfaces.flatMap { scanHosts(for: $0, cap: cap) }.filter { seen.insert($0).inserted }
    }
}
