import SwiftUI

struct CityPageView: View {
    @State var vm: CityViewModel
    @State private var scrollOffset: CGFloat = 0
    @State private var isRefreshing = false

    private var isNight: Bool {
        var cal = Calendar.current
        cal.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        let h = cal.component(.hour, from: Date())
        return h < 6 || h >= 19
    }

    var body: some View {
        ZStack(alignment: .top) {
            // Weather FX background
            if let stats = vm.stats {
                WeatherFXView(weatherText: stats.text, isNight: isNight,
                              lat: vm.loc.lat, lon: vm.loc.lon)
                    .ignoresSafeArea()
            } else {
                Color(hex: "#0b1426").ignoresSafeArea()
            }

            // Sky gradient overlay
            LinearGradient(
                colors: [Color(hex: "#0b1426").opacity(0.55), .clear, Color(hex: "#0b1426").opacity(0.30)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            ScrollView {
                LazyVStack(spacing: 0) {
                    // Hero
                    if let stats = vm.stats {
                        HeroView(stats: stats, cityName: vm.loc.name)
                            .padding(.horizontal, 20)
                    } else {
                        HeroSkeletonView()
                    }

                    // Warnings
                    if !vm.warnings.isEmpty {
                        WarningView(warnings: vm.warnings)
                            .padding(.horizontal, 20)
                            .padding(.bottom, 16)
                    }

                    // Metric strip
                    if let stats = vm.stats {
                        MetricStripView(stats: stats, avgAqi: vm.avgAqi)
                            .padding(.horizontal, 20)
                            .padding(.bottom, 28)
                    }

                    // Notice card (番禺气象台短时预报)
                    if let f = vm.panyuForecast {
                        NoticeCardView(text: f.text, issuedAt: f.issuedAt)
                            .padding(.horizontal, 16)
                            .padding(.bottom, 16)
                    }

                    // Provider cards
                    VStack(spacing: 12) {
                        ForEach(vm.annotated) { item in
                            ProviderCardView(result: item)
                        }
                    }
                    .padding(.horizontal, 16)

                    // Temperature ranking
                    if vm.annotated.filter({ $0.base.hasData }).count >= 2 {
                        TempRankingView(results: vm.annotated)
                            .padding(.horizontal, 16)
                            .padding(.top, 12)
                    }

                    // AQI section
                    if !vm.air.isEmpty {
                        AQISectionView(air: vm.air)
                            .padding(.horizontal, 16)
                            .padding(.top, 20)
                    }

                    Spacer(minLength: 48)
                }
            }
            .refreshable {
                await vm.refresh()
            }
        }
        .task {
            if vm.initialLoad { await vm.refresh() }
        }
    }
}

struct HeroSkeletonView: View {
    @State private var shimmer = false
    var body: some View {
        VStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 8).fill(shimmerGrad)
                .frame(width: 80, height: 20)
            RoundedRectangle(cornerRadius: 12).fill(shimmerGrad)
                .frame(width: 130, height: 80)
            RoundedRectangle(cornerRadius: 8).fill(shimmerGrad)
                .frame(width: 100, height: 22)
        }
        .padding(.vertical, 24)
        .onAppear { withAnimation(.linear(duration: 1.2).repeatForever()) { shimmer = true } }
    }
    private var shimmerGrad: LinearGradient {
        LinearGradient(colors: [.white.opacity(0.06), .white.opacity(0.14), .white.opacity(0.06)],
                       startPoint: shimmer ? .topLeading : .bottomTrailing,
                       endPoint: shimmer ? .bottomTrailing : .topLeading)
    }
}
