﻿using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using BitCodeGenerator.Test.Helpers;
using BitCodeGenerator.Implementations.HtmlClientProxyGenerator;
using BitTools.Core.Model;
using BitCodeGenerator.Implementations;

namespace BitCodeGenerator.Test.Implementations
{
    [TestClass]
    public class DefaultBitCodeGeneratorOrderedProjectsProviderTests : CodeGeneratorTest
    {
        [TestMethod, TestCategory("BitCodeGenerator")]
        public async Task DefaultBitCodeGeneratorOrderedProjectsProviderTestsShouldReturnProjectsAsDesired()
        {
            using (Workspace workspace = GetWorkspace())
            {
                Solution solution = workspace.CurrentSolution;

                List<Project> projects = solution.Projects.ToList();

                IList<Project> orderedProjects = (new DefaultBitCodeGeneratorOrderedProjectsProvider().GetInvolveableProjects(workspace, solution, projects,
                        new BitCodeGeneratorMapping { SourceProjects = new[] { new BitTools.Core.Model.ProjectInfo { Name = "Bit.Model" }, new BitTools.Core.Model.ProjectInfo { Name = "Foundation.Api" } } }));

                Assert.AreEqual(2, orderedProjects.Count);

                Assert.IsTrue(
                    orderedProjects.Select(p => p.Name).SequenceEqual(new[] { "Bit.Model", "Foundation.Api" }));
            }
        }
    }
}
