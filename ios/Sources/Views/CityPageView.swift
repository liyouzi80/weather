import SwiftUI

struct CityPageView: View {
    @State var vm: CityViewModel
    @State private var scrollOffset: CGFloat = 0
    @Environment(\.horizontalSizeClass) private var hSize

    private var isNight: Bool {
        var cal = Calendar.current
        cal.timeZone = TimeZone(identifier: "Asia/Shanghai")!
        let h = cal.component(.hour, from: Date())
        return h < 6 || h >= 19
    }

    // iPad（regular）横屏：内容限宽居中 + provider 卡两列
    private var isWide: Bool { hSize == .regular }
    private var maxContentWidth: CGFloat { isWide ? 760 : .infinity }
    private var statusInset: CGFloat { isWide ? 24 : 59 }
    private var providerColumns: [GridItem] {
        isWide
            ? [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
            : [GridItem(.flexible())]
    }

    // 滚动进度 0（顶部）→ 1（上滑超过阈值），驱动视差与吸顶
    private var scrollProgress: CGFloat { min(max(-scrollOffset / 180, 0), 1) }

    var body: some View {
        ZStack(alignment: .top) {
            // 天气动效背景 + 轻微视差放大
            Group {
                if let stats = vm.stats {
                    WeatherFXView(weatherText: stats.text, isNight: isNight,
                                  lat: vm.loc.lat, lon: vm.loc.lon)
                } else {
                    Color(hex: "#0b1426")
                }
            }
            .scaleEffect(1 + scrollProgress * 0.06)
            .ignoresSafeArea()

            // 天空渐变叠加
            LinearGradient(
                colors: [Color(hex: "#0b1426").opacity(0.55), .clear, Color(hex: "#0b1426").opacity(0.30)],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            scrollContent

            stickyHeader
        }
        .task {
            if vm.initialLoad { await vm.refresh() }
        }
    }

    private var scrollContent: some View {
        ScrollView {
            // 滚动偏移探针
            GeometryReader { g in
                Color.clear.preference(key: ScrollOffsetKey.self,
                                       value: g.frame(in: .named("cityScroll")).minY)
            }
            .frame(height: 0)

            LazyVStack(spacing: 0) {
                // Hero — 上滑时淡出 + 缩小 + 视差
                if let stats = vm.stats {
                    HeroView(stats: stats, cityName: vm.loc.name)
                        .padding(.horizontal, 20)
                        .opacity(1 - scrollProgress * 0.9)
                        .scaleEffect(1 - scrollProgress * 0.12, anchor: .top)
                        .offset(y: scrollOffset < 0 ? -scrollOffset * 0.25 : 0)
                } else {
                    HeroSkeletonView()
                }

                // 预警
                if !vm.warnings.isEmpty {
                    WarningView(warnings: vm.warnings)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 16)
                }

                // 关键指标条
                if let stats = vm.stats {
                    MetricStripView(stats: stats, avgAqi: vm.avgAqi)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 28)
                }

                // 番禺气象台短时预报卡
                if let f = vm.panyuForecast {
                    NoticeCardView(text: f.text, issuedAt: f.issuedAt)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                }

                // 分钟级降水
                if let rain = vm.minutelyRain {
                    MinutelyRainView(rain: rain)
                        .padding(.horizontal, 16)
                        .padding(.bottom, 16)
                }

                // 信源卡片（iPad 横屏两列）
                LazyVGrid(columns: providerColumns, spacing: 12) {
                    ForEach(vm.annotated) { item in
                        ProviderCardView(result: item)
                    }
                }
                .padding(.horizontal, 16)

                // 温度排行
                if vm.annotated.filter({ $0.base.hasData }).count >= 2 {
                    TempRankingView(results: vm.annotated)
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                }

                // AQI
                if !vm.air.isEmpty {
                    AQISectionView(air: vm.air)
                        .padding(.horizontal, 16)
                        .padding(.top, 20)
                }

                Spacer(minLength: 48)
            }
            .frame(maxWidth: maxContentWidth)
            .frame(maxWidth: .infinity)
        }
        .coordinateSpace(name: "cityScroll")
        .onPreferenceChange(ScrollOffsetKey.self) { scrollOffset = $0 }
        .refreshable {
            await vm.refresh()
        }
    }

    // 上滑吸顶条：城市名 + 温度 + 天气，滚过 55% 后淡入
    private var stickyHeader: some View {
        HStack(spacing: 8) {
            Text(vm.loc.name)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
            if let s = vm.stats {
                Text("\(Int(s.avg.rounded()))°")
                    .font(.system(size: 16, weight: .medium).monospacedDigit())
                    .foregroundStyle(.white)
                Text(s.text)
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.70))
            }
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, statusInset)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .opacity(Double(max(0, (scrollProgress - 0.55) / 0.35)))
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
    }
}

// 滚动偏移 PreferenceKey
struct ScrollOffsetKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
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
