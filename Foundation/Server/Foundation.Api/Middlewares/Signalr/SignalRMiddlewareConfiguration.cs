﻿using System;
using Foundation.Api.Contracts;
using Foundation.Api.Middlewares.SignalR.Contracts;
using Foundation.Core.Contracts;
using Microsoft.AspNet.SignalR;
using Owin;
using System.Collections.Generic;
using System.Linq;

namespace Foundation.Api.Middlewares.SignalR
{
    public class SignalRMiddlewareConfiguration : IOwinMiddlewareConfiguration
    {
        private readonly IAppEnvironmentProvider _appEnvironmentProvider;
        private readonly IEnumerable<ISignalRConfiguration> _signalRScaleoutConfigurations;
        private readonly Microsoft.AspNet.SignalR.IDependencyResolver _dependencyResolver;

        protected SignalRMiddlewareConfiguration()
        {
        }

        public SignalRMiddlewareConfiguration(Microsoft.AspNet.SignalR.IDependencyResolver dependencyResolver, IAppEnvironmentProvider appEnvironmentProvider,
            IEnumerable<ISignalRConfiguration> signalRScaleoutConfigurations = null)
        {
            if (appEnvironmentProvider == null)
                throw new ArgumentNullException(nameof(appEnvironmentProvider));

            if (dependencyResolver == null)
                throw new ArgumentNullException(nameof(dependencyResolver));

            _appEnvironmentProvider = appEnvironmentProvider;
            _dependencyResolver = dependencyResolver;
            _signalRScaleoutConfigurations = signalRScaleoutConfigurations;

        }

        public virtual void Configure(IAppBuilder owinApp)
        {
            if (owinApp == null)
                throw new ArgumentNullException(nameof(owinApp));

            HubConfiguration signalRConfig = new HubConfiguration
            {
                EnableDetailedErrors = _appEnvironmentProvider.GetActiveAppEnvironment().DebugMode == true,
                EnableJavaScriptProxies = true,
                EnableJSONP = false,
                Resolver = _dependencyResolver
            };

            _signalRScaleoutConfigurations.ToList()
                .ForEach(cnfg =>
                {
                    cnfg.Configure(signalRConfig);
                });

            owinApp.Map("/signalr", innerOwinApp =>
            {
                innerOwinApp.RunSignalR(signalRConfig);
            });
        }
    }
}